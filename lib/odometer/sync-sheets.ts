import type { SupabaseClient } from "@supabase/supabase-js";
import { syncOdometerDailySheets } from "@/lib/google/sheets-append";
import {
  buildDailySummaries,
  isTodayTabSummary,
  type DailyOdoPerson,
  type DailyOdoVehicle,
  type OdometerReadingRow,
} from "@/lib/odometer/daily-summary";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function asReading(row: Record<string, unknown>): OdometerReadingRow {
  return {
    vehicle_id: String(row.vehicle_id),
    employee_id: String(row.employee_id),
    team_id: (row.team_id as string | null) ?? null,
    reading_date: String(row.reading_date),
    slot: row.slot === "end" || row.slot === "evening" ? "end" : "start",
    captured_at: String(row.captured_at),
    lat: typeof row.lat === "number" ? row.lat : row.lat != null ? Number(row.lat) : null,
    lng: typeof row.lng === "number" ? row.lng : row.lng != null ? Number(row.lng) : null,
    plate_number_final: String(row.plate_number_final ?? ""),
    odometer_km_final: Number(row.odometer_km_final) || 0,
    plate_photo_url: String(row.plate_photo_url ?? ""),
    odometer_photo_urls: row.odometer_photo_urls,
    ocr_status: String(row.ocr_status ?? ""),
    location_label: typeof row.location_label === "string" ? row.location_label : null,
    duty_shift_id: typeof row.duty_shift_id === "string" ? row.duty_shift_id : null,
  };
}

export async function syncOdometerSheetsAfterSave(
  admin: SupabaseClient,
  input: { vehicleId: string; readingDate: string }
): Promise<void> {
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const fromDate = addDays(todayIso, -14);
  const { data: rawRows, error } = await admin
    .from("vehicle_odometer_readings")
    .select(
      "vehicle_id, employee_id, team_id, reading_date, slot, captured_at, lat, lng, location_label, plate_number_final, odometer_km_final, plate_photo_url, odometer_photo_urls, ocr_status, duty_shift_id"
    )
    .gte("reading_date", fromDate)
    .lte("reading_date", todayIso);

  if (error) throw new Error(error.message);
  const readings = (rawRows ?? []).map((r) => asReading(r as Record<string, unknown>));
  if (readings.length === 0) return;

  const employeeIds = [...new Set(readings.map((r) => r.employee_id))];
  const vehicleIds = [...new Set(readings.map((r) => r.vehicle_id))];
  const teamIds = [...new Set(readings.map((r) => r.team_id).filter(Boolean) as string[])];

  const [{ data: employees }, { data: vehicleRows }, { data: teams }] = await Promise.all([
    admin.from("employees").select("id, full_name, region_id").in("id", employeeIds),
    admin.from("vehicles").select("id, make, model").in("id", vehicleIds),
    teamIds.length
      ? admin.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
  ]);

  const regionIds = [...new Set((employees ?? []).map((e) => e.region_id).filter(Boolean) as string[])];
  const { data: regions } = regionIds.length
    ? await admin.from("regions").select("id, name").in("id", regionIds)
    : { data: [] as Array<{ id: string; name: string | null }> };
  const regionMap = new Map((regions ?? []).map((r) => [r.id, (r.name as string | null) ?? ""]));
  const teamMap = new Map((teams ?? []).map((t) => [t.id, (t.name as string | null) ?? ""]));

  const people = new Map<string, DailyOdoPerson>();
  for (const e of employees ?? []) {
    people.set(e.id as string, {
      full_name: (e.full_name as string | null) ?? "",
      region_name: e.region_id ? regionMap.get(e.region_id as string) ?? "" : "",
      team_name: "",
    });
  }
  for (const r of readings) {
    if (!r.team_id) continue;
    const p = people.get(r.employee_id);
    if (p && !p.team_name) p.team_name = teamMap.get(r.team_id) ?? "";
  }

  const vehicles = new Map<string, DailyOdoVehicle>();
  for (const v of vehicleRows ?? []) {
    vehicles.set(v.id as string, {
      make: (v.make as string | null) ?? "",
      model: (v.model as string | null) ?? "",
    });
  }

  const summaries = buildDailySummaries(readings, people, vehicles);
  const historySummary = summaries.find(
    (s) => s.vehicle_id === input.vehicleId && s.reading_date === input.readingDate
  );
  if (!historySummary) return;

  await syncOdometerDailySheets({
    readingDate: todayIso,
    todaySummaries: summaries.filter((s) => isTodayTabSummary(s, todayIso)),
    historySummary,
  });
}
