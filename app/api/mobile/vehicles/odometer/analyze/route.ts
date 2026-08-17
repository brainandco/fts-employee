import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { analyzeOdometerPhotos, normalizeOdometerPhotoUrls } from "@/lib/odometer/odometer-service";

export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee access only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "";
  const platePhotoUrl = typeof body.plate_photo_url === "string" ? body.plate_photo_url.trim() : "";
  const odometerPhotoUrls = normalizeOdometerPhotoUrls(body.odometer_photo_urls);
  if (!vehicleId) return NextResponse.json({ message: "vehicle_id is required" }, { status: 400 });

  const supabase = await getDataClient();
  const result = await analyzeOdometerPhotos(supabase, access.employeeId, {
    vehicleId,
    platePhotoUrl,
    odometerPhotoUrls,
  });
  if (result.error) return NextResponse.json({ message: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
