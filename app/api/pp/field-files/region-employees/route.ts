import { getDataClient } from "@/lib/supabase/server";
import { employeeNameFolderSlug } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { NextResponse } from "next/server";

/** GET ?regionId= — active employees in region (PP cross-region access). */
export async function GET(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const regionId = new URL(req.url).searchParams.get("regionId")?.trim();
  if (!regionId) {
    return NextResponse.json({ message: "regionId is required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: rows, error } = await supabase
    .from("employees")
    .select("id, full_name, email")
    .eq("region_id", regionId)
    .eq("status", "ACTIVE")
    .order("full_name");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({
    employees: (rows ?? []).map((e) => ({
      id: e.id,
      fullName: e.full_name ?? "—",
      email: e.email,
      folderSlug: employeeNameFolderSlug(e.full_name ?? null, e.id),
    })),
  });
}
