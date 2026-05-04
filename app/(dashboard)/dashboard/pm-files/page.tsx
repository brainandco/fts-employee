import { assertPmEmployeeFilesPageAccess } from "@/lib/pm-files/auth";
import { getDataClient } from "@/lib/supabase/server";
import { PmFilesWorkspaceClient } from "@/components/pm-files/PmFilesWorkspaceClient";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";

export default async function PmFilesPage() {
  const { allowedRegionIds } = await assertPmEmployeeFilesPageAccess();

  const supabase = await getDataClient();
  const { data: folderRows } =
    allowedRegionIds.length > 0
      ? await supabase
          .from("employee_file_region_folders")
          .select("id, region_id, path_segment, created_at")
          .in("region_id", allowedRegionIds)
          .order("path_segment")
      : { data: [] };

  const regionIds = [...new Set((folderRows ?? []).map((f) => f.region_id))];
  const { data: regMeta } =
    regionIds.length > 0
      ? await supabase.from("regions").select("id, name, code").in("id", regionIds)
      : { data: [] };

  const byRegion = new Map((regMeta ?? []).map((r) => [r.id, r] as const));
  const initialFolders = (folderRows ?? []).map((f) => {
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

  return (
    <PmFilesWorkspaceClient initialFolders={initialFolders} ppConfigured={isPpReportsBucketConfigured()} />
  );
}
