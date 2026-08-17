import { NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { analyzeOdometerPhotos, normalizeOdometerPhotoUrls } from "@/lib/odometer/odometer-service";

/** POST — run OCR (under monthly cap) and return suggested plate/km for confirmation. */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id.trim() : "";
  const platePhotoUrl = typeof body.plate_photo_url === "string" ? body.plate_photo_url.trim() : "";
  const odometerPhotoUrls = normalizeOdometerPhotoUrls(body.odometer_photo_urls);

  if (!vehicleId) return NextResponse.json({ message: "vehicle_id is required" }, { status: 400 });

  const supabase = await getDataClient();
  const email = (auth.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const result = await analyzeOdometerPhotos(supabase, employee.id as string, {
    vehicleId,
    platePhotoUrl,
    odometerPhotoUrls,
  });
  if (result.error) return NextResponse.json({ message: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
