import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { reverseGeocodeLatLng } from "@/lib/odometer/reverse-geocode";

export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ message: "lat and lng are required" }, { status: 400 });
  }

  const label = await reverseGeocodeLatLng(lat, lng);
  return NextResponse.json({ label: label || null });
}
