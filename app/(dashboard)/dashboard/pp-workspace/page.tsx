import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { PpWorkspaceClient } from "@/components/pp/PpWorkspaceClient";
import { hasReportingPortalRole } from "@/lib/pp/auth";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";

export default async function PpWorkspacePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.email) redirect("/login");

  const email = session.user.email.trim().toLowerCase();
  const dataClient = await getDataClient();
  const { data: employee } = await dataClient.from("employees").select("id, status, full_name").eq("email", email).maybeSingle();

  if (!employee || employee.status !== "ACTIVE") redirect("/dashboard");

  const { data: roles } = await dataClient.from("employee_roles").select("role").eq("employee_id", employee.id);
  if (!hasReportingPortalRole(roles ?? [])) redirect("/dashboard");

  const { data: regions } = await dataClient.from("regions").select("id, name, code").order("name");
  const { data: folderRows } = await dataClient
    .from("employee_file_region_folders")
    .select("id, region_id, path_segment, created_at")
    .order("path_segment");

  const regionIds = [...new Set((folderRows ?? []).map((f) => f.region_id))];
  const { data: regMeta } =
    regionIds.length > 0
      ? await dataClient.from("regions").select("id, name, code").in("id", regionIds)
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
    <PpWorkspaceClient
      regions={regions ?? []}
      initialFolders={initialFolders}
      ppReportsConfigured={isPpReportsBucketConfigured()}
      reporterFullName={(employee.full_name as string | null) ?? null}
    />
  );
}
