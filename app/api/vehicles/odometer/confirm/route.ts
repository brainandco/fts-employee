import { NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import {
  confirmOdometerReading,
  normalizeOdometerPhotoUrls,
  type OdometerSlot,
} from "@/lib/odometer/odometer-service";

/** POST — persist start/end duty odometer reading + Sheets row. */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "";
  const slot = body.slot as OdometerSlot;
  const readingDate = typeof body.reading_date === "string" ? body.reading_date.trim() : "";
  const capturedAt = typeof body.captured_at === "string" ? body.captured_at.trim() : "";
  const platePhotoUrl = typeof body.plate_photo_url === "string" ? body.plate_photo_url.trim() : "";
  const odometerPhotoUrls = normalizeOdometerPhotoUrls(body.odometer_photo_urls);
  const plateNumberFinal = typeof body.plate_number_final === "string" ? body.plate_number_final : "";
  const odometerKmFinal = Number(body.odometer_km_final);
  const ocrStatus = body.ocr_status === "failed" || body.ocr_status === "skipped_quota" ? body.ocr_status : "ok";
  const ocrUnitsUsed = Number(body.ocr_units_used) || 0;
  const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
  const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
  const accuracyM = body.accuracy_m == null || body.accuracy_m === "" ? null : Number(body.accuracy_m);

  const supabase = await getDataClient();
  const email = (auth.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const result = await confirmOdometerReading(supabase, employee.id as string, {
    vehicleId,
    slot,
    readingDate,
    capturedAt,
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    accuracyM: accuracyM != null && Number.isFinite(accuracyM) ? accuracyM : null,
    platePhotoUrl,
    odometerPhotoUrls,
    plateNumberFinal,
    odometerKmFinal,
    ocrPlateRaw: typeof body.ocr_plate_raw === "string" ? body.ocr_plate_raw : null,
    ocrOdometerRaw: typeof body.ocr_odometer_raw === "string" ? body.ocr_odometer_raw : null,
    ocrStatus,
    ocrUnitsUsed,
  });

  if (result.error) return NextResponse.json({ message: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.data?.id, dutyStatus: result.data?.dutyStatus, shiftId: result.data?.shiftId });
}
