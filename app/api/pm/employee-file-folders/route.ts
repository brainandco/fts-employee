import { getDataClient } from "@/lib/supabase/server";
import { requirePmEmployeeFilesAccess } from "@/lib/pm-files/auth";
import { NextResponse } from "next/server";

/** GET — region folders in the PM’s allowed regions only (no POST: admins provision storage). */
export async function GET() {
  const gate = await requirePmEmployeeFilesAccess();
  if (gate instanceof NextResponse) return gate;

  const supabase = await getDataClient();
  const { data: folderRows, error } = await supabase
    .from("employee_file_region_folders")
    .select("id, region_id, path_segment, created_at, created_by")
    .in("region_id", gate.allowedRegionIds)
    .order("path_segment");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  const regionIds = [...new Set((folderRows ?? []).map((f) => f.region_id))];
  const { data: regionList } = regionIds.length
    ? await supabase.from("regions").select("id, name, code").in("id", regionIds)
    : { data: [] };
  const byRegion = new Map((regionList ?? []).map((r) => [r.id, r] as const));
  const folders = (folderRows ?? []).map((f) => {
    const reg = byRegion.get(f.region_id);
    return {
      id: f.id,
      regionId: f.region_id,
      pathSegment: f.path_segment,
      createdAt: f.created_at,
      regionName: reg?.name ?? "—",
      regionCode: reg?.code ?? null,
    };
  });
  return NextResponse.json({ folders });
}
