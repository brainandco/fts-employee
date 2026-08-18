import type { SupabaseClient } from "@supabase/supabase-js";
import { detectTextFromImageUrl, detectTextFromImageUrls } from "@/lib/ocr/google-vision";
import { parseOdometerCandidates } from "@/lib/ocr/parse-odometer";
import { parsePlateCandidates } from "@/lib/ocr/parse-plate";
import { getOcrUsageThisMonth } from "@/lib/ocr/quota";
import { syncOdometerSheetsAfterSave } from "@/lib/odometer/sync-sheets";
import { reverseGeocodeLatLng } from "@/lib/odometer/reverse-geocode";
import { normalizeDutySlot, riyadhIsoDate, type DutySlot } from "@/lib/odometer/duty-slot";
import { notifyVehicleDutyAdmins } from "@/lib/notify-vehicle-duty-admins";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { isVehicleAssigneeRole, VEHICLE_ASSIGNEE_ROLES_LABEL } from "@/lib/employees/vehicle-assignment-roles";

export type OdometerSlot = DutySlot | "morning" | "evening";

export type AnalyzeOdometerInput = {
  vehicleId: string;
  platePhotoUrl: string;
  odometerPhotoUrls: string[];
};

export type AnalyzeOdometerResult = {
  ocrStatus: "ok" | "failed" | "skipped_quota";
  ocrUnitsUsed: number;
  quota: { unitsUsed: number; cap: number; yearMonth: string };
  plate: { suggested: string | null; candidates: string[]; raw: string };
  odometer: { suggestedKm: number | null; candidates: number[]; raw: string };
  vehicle: {
    id: string;
    plate_number: string | null;
    make: string | null;
    model: string | null;
    mileage: number | null;
  };
  employee: { id: string; full_name: string | null; region_name: string | null };
};

export type ConfirmOdometerInput = {
  vehicleId: string;
  slot: OdometerSlot;
  readingDate: string; // YYYY-MM-DD (local preferred)
  capturedAt: string; // ISO
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  platePhotoUrl: string;
  odometerPhotoUrls: string[];
  plateNumberFinal: string;
  odometerKmFinal: number;
  ocrPlateRaw: string | null;
  ocrOdometerRaw: string | null;
  ocrStatus: "ok" | "failed" | "skipped_quota";
  ocrUnitsUsed: number;
};

function parseUrlList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((u): u is string => typeof u === "string" && u.startsWith("http")).slice(0, 8);
}

export function normalizeOdometerPhotoUrls(input: unknown): string[] {
  return parseUrlList(input);
}

export async function loadAssigneeContext(supabase: SupabaseClient, employeeId: string, vehicleId: string) {
  const [{ data: roleRows }, { data: assignment }] = await Promise.all([
    supabase.from("employee_roles").select("role").eq("employee_id", employeeId),
    supabase
      .from("vehicle_assignments")
      .select("vehicle_id")
      .eq("employee_id", employeeId)
      .eq("vehicle_id", vehicleId)
      .maybeSingle(),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as string);
  if (!roles.some((r) => isVehicleAssigneeRole(r))) {
    return { error: `Only ${VEHICLE_ASSIGNEE_ROLES_LABEL} can submit odometer readings.`, status: 403 as const };
  }
  if (!assignment?.vehicle_id) {
    return { error: "This vehicle is not assigned to you.", status: 403 as const };
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, region_id, project_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) return { error: "Employee not found", status: 403 as const };

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, plate_number, make, model, mileage")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) return { error: "Vehicle not found", status: 404 as const };

  let region_name: string | null = null;
  if (employee.region_id) {
    const { data: region } = await supabase.from("regions").select("name").eq("id", employee.region_id).maybeSingle();
    region_name = (region?.name as string | null) ?? null;
  }

  let team_id: string | null = null;
  let team_name: string | null = null;
  const { data: teamAsDriver } = await supabase
    .from("teams")
    .select("id, name")
    .eq("driver_rigger_employee_id", employeeId)
    .maybeSingle();
  if (teamAsDriver) {
    team_id = teamAsDriver.id as string;
    team_name = (teamAsDriver.name as string | null) ?? null;
  }

  return {
    employee: {
      id: employee.id as string,
      full_name: (employee.full_name as string | null) ?? null,
      region_id: employee.region_id as string | null,
      region_name,
      project_id: employee.project_id as string | null,
    },
    vehicle: {
      id: vehicle.id as string,
      plate_number: (vehicle.plate_number as string | null) ?? null,
      make: (vehicle.make as string | null) ?? null,
      model: (vehicle.model as string | null) ?? null,
      mileage: typeof vehicle.mileage === "number" ? vehicle.mileage : Number(vehicle.mileage) || 0,
    },
    team_id,
    team_name,
  };
}

export async function analyzeOdometerPhotos(
  supabase: SupabaseClient,
  employeeId: string,
  input: AnalyzeOdometerInput
): Promise<{ data?: AnalyzeOdometerResult; error?: string; status: number }> {
  if (!input.platePhotoUrl?.startsWith("http")) {
    return { error: "plate_photo_url is required", status: 400 };
  }
  const odoUrls = normalizeOdometerPhotoUrls(input.odometerPhotoUrls);
  if (odoUrls.length < 1) {
    return { error: "At least one odometer photo is required", status: 400 };
  }

  const ctx = await loadAssigneeContext(supabase, employeeId, input.vehicleId);
  if ("error" in ctx && ctx.error) return { error: ctx.error, status: ctx.status };
  const okCtx = ctx as Exclude<typeof ctx, { error: string }>;

  let ocrStatus: AnalyzeOdometerResult["ocrStatus"] = "ok";
  let unitsUsed = 0;
  let plateRaw = "";
  let odoRaw = "";

  try {
    const plateRes = await detectTextFromImageUrl(input.platePhotoUrl);
    if (plateRes.skippedQuota) {
      ocrStatus = "skipped_quota";
    } else {
      plateRaw = plateRes.fullText;
      unitsUsed += plateRes.unitsUsed;
    }

    if (ocrStatus !== "skipped_quota") {
      const odoRes = await detectTextFromImageUrls(odoUrls);
      if (odoRes.skippedQuota) {
        ocrStatus = unitsUsed > 0 ? "ok" : "skipped_quota";
      }
      odoRaw = odoRes.texts.filter(Boolean).join("\n---\n");
      unitsUsed += odoRes.unitsUsed;
      if (!plateRaw && !odoRaw && odoRes.skippedQuota) ocrStatus = "skipped_quota";
    }
  } catch (e) {
    ocrStatus = "failed";
    console.error("[odometer-ocr]", e);
  }

  const plateParsed = parsePlateCandidates(plateRaw, okCtx.vehicle.plate_number);
  const odoParsed = parseOdometerCandidates(odoRaw, okCtx.vehicle.mileage);
  const suggestedPlate = plateParsed.best || okCtx.vehicle.plate_number || null;

  const qAfter = await getOcrUsageThisMonth();

  return {
    status: 200,
    data: {
      ocrStatus,
      ocrUnitsUsed: unitsUsed,
      quota: qAfter,
      plate: { suggested: suggestedPlate, candidates: plateParsed.candidates, raw: plateRaw },
      odometer: { suggestedKm: odoParsed.best, candidates: odoParsed.candidates, raw: odoRaw },
      vehicle: (ctx as Exclude<typeof ctx, { error: string }>).vehicle,
      employee: {
        id: (ctx as Exclude<typeof ctx, { error: string }>).employee.id,
        full_name: (ctx as Exclude<typeof ctx, { error: string }>).employee.full_name,
        region_name: (ctx as Exclude<typeof ctx, { error: string }>).employee.region_name,
      },
    },
  };
}

type OpenShiftRow = {
  id: string;
  vehicle_id: string;
  employee_id: string;
  start_km: number;
  shift_date: string;
  started_at: string;
};

export async function confirmOdometerReading(
  supabase: SupabaseClient,
  employeeId: string,
  input: ConfirmOdometerInput
): Promise<{ data?: { id: string; dutyStatus: "open" | "closed"; shiftId: string }; error?: string; status: number }> {
  const slot = normalizeDutySlot(input.slot);
  if (!slot) {
    return { error: "slot must be start or end", status: 400 };
  }
  if (!input.platePhotoUrl?.startsWith("http")) {
    return { error: "plate_photo_url is required", status: 400 };
  }
  const odoUrls = normalizeOdometerPhotoUrls(input.odometerPhotoUrls);
  if (odoUrls.length < 1) {
    return { error: "At least one odometer photo is required", status: 400 };
  }
  const plateFinal = input.plateNumberFinal.trim();
  if (!plateFinal) return { error: "plate_number_final is required", status: 400 };
  if (!Number.isFinite(input.odometerKmFinal) || input.odometerKmFinal < 0) {
    return { error: "odometer_km_final must be a non-negative number", status: 400 };
  }
  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    return { error: "captured_at must be a valid ISO timestamp", status: 400 };
  }
  if (input.lat == null || input.lng == null || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { error: "GPS is required to start or end duty", status: 400 };
  }

  const ctx = await loadAssigneeContext(supabase, employeeId, input.vehicleId);
  if ("error" in ctx && ctx.error) return { error: ctx.error, status: ctx.status };
  const okCtx = ctx as Exclude<typeof ctx, { error: string }>;

  const admin = createServerSupabaseAdmin();
  const [{ data: openForVehicle }, { data: openForEmployee }] = await Promise.all([
    admin
      .from("vehicle_duty_shifts")
      .select("id, vehicle_id, employee_id, start_km, shift_date, started_at")
      .eq("vehicle_id", input.vehicleId)
      .eq("status", "open")
      .maybeSingle(),
    admin
      .from("vehicle_duty_shifts")
      .select("id, vehicle_id, employee_id, start_km, shift_date, started_at")
      .eq("employee_id", employeeId)
      .eq("status", "open")
      .maybeSingle(),
  ]);

  let locationLabel: string | null = null;
  if (input.lat != null && input.lng != null) {
    locationLabel = await reverseGeocodeLatLng(input.lat, input.lng);
  }

  const kmFinal = Math.round(input.odometerKmFinal);
  const capturedIso = capturedAt.toISOString();
  const driverName = okCtx.employee.full_name || "Driver";
  const plate = okCtx.vehicle.plate_number || plateFinal;
  const adminLink = (() => {
    const base = (process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "").replace(/\/$/, "");
    return base ? `${base}/vehicles/odometer` : "/vehicles/odometer";
  })();

  if (slot === "start") {
    if (openForVehicle) {
      return { error: "Duty already started for this vehicle. Submit end odometer photos to end duty first.", status: 409 };
    }
    if (openForEmployee) {
      return { error: "You already have an open duty. Submit end odometer photos to end it first.", status: 409 };
    }
    const shiftDate = riyadhIsoDate(capturedAt);
    const { data: shift, error: shiftErr } = await admin
      .from("vehicle_duty_shifts")
      .insert({
        vehicle_id: input.vehicleId,
        employee_id: employeeId,
        team_id: okCtx.team_id,
        shift_date: shiftDate,
        started_at: capturedIso,
        start_km: kmFinal,
        status: "open",
      })
      .select("id")
      .maybeSingle();
    if (shiftErr || !shift?.id) {
      return { error: shiftErr?.message || "Failed to start duty", status: 400 };
    }

    const inserted = await insertReading(admin, {
      vehicle_id: input.vehicleId,
      employee_id: employeeId,
      team_id: okCtx.team_id,
      slot: "start",
      reading_date: shiftDate,
      captured_at: capturedIso,
      lat: input.lat,
      lng: input.lng,
      accuracy_m: input.accuracyM,
      location_label: locationLabel,
      plate_photo_url: input.platePhotoUrl,
      odometer_photo_urls: odoUrls,
      ocr_plate_raw: input.ocrPlateRaw,
      ocr_odometer_raw: input.ocrOdometerRaw,
      plate_number_final: plateFinal,
      odometer_km_final: kmFinal,
      ocr_status: input.ocrStatus,
      ocr_units_used: Math.max(0, Math.round(input.ocrUnitsUsed) || 0),
      duty_shift_id: shift.id as string,
    });
    if ("error" in inserted) {
      await admin.from("vehicle_duty_shifts").delete().eq("id", shift.id);
      return inserted;
    }

    await admin
      .from("vehicle_duty_shifts")
      .update({ start_reading_id: inserted.id, updated_at: new Date().toISOString() })
      .eq("id", shift.id);

    if (kmFinal >= (okCtx.vehicle.mileage ?? 0)) {
      await admin.from("vehicles").update({ mileage: kmFinal }).eq("id", input.vehicleId);
    }

    try {
      await notifyVehicleDutyAdmins(admin, {
        title: "Duty started",
        body: `${driverName} started duty · ${plate} · ${kmFinal.toLocaleString()} km`,
        link: adminLink,
        meta: { shiftId: shift.id, vehicleId: input.vehicleId, employeeId, slot: "start" },
      });
    } catch (e) {
      console.error("[odometer-duty-notify]", e);
    }

    await syncSheetsSafe(admin, input.vehicleId, shiftDate);
    return { status: 200, data: { id: inserted.id, dutyStatus: "open", shiftId: shift.id as string } };
  }

  const open: OpenShiftRow | null =
    openForVehicle && openForVehicle.employee_id === employeeId
      ? (openForVehicle as OpenShiftRow)
      : openForEmployee && openForEmployee.vehicle_id === input.vehicleId
        ? (openForEmployee as OpenShiftRow)
        : null;
  if (!open) {
    return { error: "Start duty first by submitting start odometer photos.", status: 409 };
  }
  if (kmFinal < Number(open.start_km)) {
    return { error: `End km cannot be less than start km (${open.start_km}).`, status: 400 };
  }

  const inserted = await insertReading(admin, {
    vehicle_id: input.vehicleId,
    employee_id: employeeId,
    team_id: okCtx.team_id,
    slot: "end",
    reading_date: String(open.shift_date),
    captured_at: capturedIso,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracyM,
    location_label: locationLabel,
    plate_photo_url: input.platePhotoUrl,
    odometer_photo_urls: odoUrls,
    ocr_plate_raw: input.ocrPlateRaw,
    ocr_odometer_raw: input.ocrOdometerRaw,
    plate_number_final: plateFinal,
    odometer_km_final: kmFinal,
    ocr_status: input.ocrStatus,
    ocr_units_used: Math.max(0, Math.round(input.ocrUnitsUsed) || 0),
    duty_shift_id: open.id,
  });
  if ("error" in inserted) return inserted;

  await admin
    .from("vehicle_duty_shifts")
    .update({
      status: "closed",
      ended_at: capturedIso,
      end_km: kmFinal,
      end_reading_id: inserted.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", open.id)
    .eq("status", "open");

  if (kmFinal >= (okCtx.vehicle.mileage ?? 0)) {
    await admin.from("vehicles").update({ mileage: kmFinal }).eq("id", input.vehicleId);
  }

  const tripKm = kmFinal - Number(open.start_km);
  try {
    await notifyVehicleDutyAdmins(admin, {
      title: "Duty ended",
      body: `${driverName} ended duty · ${plate} · ${tripKm.toLocaleString()} km this shift`,
      link: adminLink,
      meta: { shiftId: open.id, vehicleId: input.vehicleId, employeeId, slot: "end", tripKm },
    });
  } catch (e) {
    console.error("[odometer-duty-notify]", e);
  }

  await syncSheetsSafe(admin, input.vehicleId, String(open.shift_date));
  return { status: 200, data: { id: inserted.id, dutyStatus: "closed", shiftId: open.id } };
}

async function insertReading(
  admin: SupabaseClient,
  row: Record<string, unknown>
): Promise<{ id: string } | { error: string; status: number }> {
  const { data: inserted, error: insErr } = await admin
    .from("vehicle_odometer_readings")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (insErr) return { error: insErr.message, status: 400 };
  if (!inserted?.id) return { error: "Failed to save reading", status: 500 };
  return { id: inserted.id as string };
}

async function syncSheetsSafe(admin: SupabaseClient, vehicleId: string, readingDate: string) {
  try {
    await syncOdometerSheetsAfterSave(admin, { vehicleId, readingDate });
  } catch (e) {
    console.error("[odometer-sheets]", e);
  }
}
