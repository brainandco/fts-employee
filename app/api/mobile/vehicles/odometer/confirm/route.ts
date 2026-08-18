import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import {
  confirmOdometerReading,
  normalizeOdometerPhotoUrls,
  type OdometerSlot,
} from "@/lib/odometer/odometer-service";

export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee access only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const lat = body.lat == null || body.lat === "" ? null : Number(body.lat);
  const lng = body.lng == null || body.lng === "" ? null : Number(body.lng);
  const accuracyM = body.accuracy_m == null || body.accuracy_m === "" ? null : Number(body.accuracy_m);
  const supabase = await getDataClient();
  const result = await confirmOdometerReading(supabase, access.employeeId, {
    vehicleId: typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "",
    slot: body.slot as OdometerSlot,
    readingDate: typeof body.reading_date === "string" ? body.reading_date.trim() : "",
    capturedAt: typeof body.captured_at === "string" ? body.captured_at.trim() : "",
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    accuracyM: accuracyM != null && Number.isFinite(accuracyM) ? accuracyM : null,
    platePhotoUrl: typeof body.plate_photo_url === "string" ? body.plate_photo_url.trim() : "",
    odometerPhotoUrls: normalizeOdometerPhotoUrls(body.odometer_photo_urls),
    plateNumberFinal: typeof body.plate_number_final === "string" ? body.plate_number_final : "",
    odometerKmFinal: Number(body.odometer_km_final),
    ocrPlateRaw: typeof body.ocr_plate_raw === "string" ? body.ocr_plate_raw : null,
    ocrOdometerRaw: typeof body.ocr_odometer_raw === "string" ? body.ocr_odometer_raw : null,
    ocrStatus: body.ocr_status === "failed" || body.ocr_status === "skipped_quota" ? body.ocr_status : "ok",
    ocrUnitsUsed: Number(body.ocr_units_used) || 0,
  });

  if (result.error) return NextResponse.json({ message: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.data?.id, dutyStatus: result.data?.dutyStatus, shiftId: result.data?.shiftId });
}
