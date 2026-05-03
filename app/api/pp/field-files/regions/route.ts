import { getDataClient } from "@/lib/supabase/server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { NextResponse } from "next/server";

/** GET — regions that have employee file storage (PP browses all). */
export async function GET() {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const supabase = await getDataClient();
  const { data: folderRows, error } = await supabase
    .from("employee_file_region_folders")
    .select("id, region_id, path_segment, created_at")
    .order("path_segment");

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const regionIds = [...new Set((folderRows ?? []).map((f) => f.region_id))];
  const { data: regMeta } =
    regionIds.length > 0
      ? await supabase.from("regions").select("id, name, code").in("id", regionIds)
      : { data: [] };

  const byRegion = new Map((regMeta ?? []).map((r) => [r.id, r] as const));
  const folders = (folderRows ?? []).map((f) => {
    const r = byRegion.get(f.region_id);
    return {
      id: f.id,
      regionId: f.region_id,
      pathSegment: f.path_segment,
      createdAt: f.created_at,
      regionName: r?.name ?? "—",
      regionCode: r?.code ?? null,
    };
  });

  return NextResponse.json({ folders });
}
