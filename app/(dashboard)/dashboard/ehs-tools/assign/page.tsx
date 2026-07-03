import { getDataClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { resolvePortalAdminAssetAssigner } from "@/lib/portal-asset-assign-auth";
import { PmAssignEhsToolsClient } from "@/components/ehs/PmAssignEhsToolsClient";

export default async function PmAssignEhsToolsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) redirect("/login");

  const email = (session.user.email ?? "").trim();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, region_id, project_id")
    .eq("email", email)
    .maybeSingle();

  const { data: roles } = employee
    ? await supabase.from("employee_roles").select("role").eq("employee_id", employee.id)
    : { data: [] };
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, session.user.id, email);
  if (!isPm && !isPortalAdmin) redirect("/dashboard");

  let assetsQuery = supabase
    .from("assets")
    .select("id, asset_id, name, status, ehs_wear_role, ehs_tool_type, en_code, assigned_region_id")
    .eq("is_ehs_tool", true)
    .eq("status", "Available")
    .is("assigned_to_employee_id", null)
    .order("asset_id");

  if (isPm && employee) {
    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      session.user.id
    );
    if (allowedRegionIds.length > 0) {
      const orParts = [...allowedRegionIds.map((id) => `assigned_region_id.eq.${id}`), "assigned_region_id.is.null"];
      assetsQuery = assetsQuery.or(orParts.join(","));
    }
  }

  const { data: assets } = await assetsQuery;

  let teamsQuery = supabase
    .from("teams")
    .select("id, name, dt_employee_id, driver_rigger_employee_id")
    .not("dt_employee_id", "is", null)
    .order("name");

  if (isPm && employee) {
    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      session.user.id
    );
    if (allowedRegionIds.length > 0) teamsQuery = teamsQuery.in("region_id", allowedRegionIds);
  }

  const { data: teamsRaw } = await teamsQuery;
  const empIds = [
    ...new Set(
      (teamsRaw ?? []).flatMap((t) => [t.dt_employee_id, t.driver_rigger_employee_id].filter(Boolean) as string[])
    ),
  ];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name, email, status").in("id", empIds)
    : { data: [] };
  const empMap = new Map(
    (emps ?? []).map((e) => [e.id, { full_name: (e.full_name ?? e.email ?? "—").trim() || "—", status: e.status }])
  );

  const dtTeams = (teamsRaw ?? [])
    .filter((t) => {
      const dt = t.dt_employee_id ? empMap.get(t.dt_employee_id as string) : null;
      return dt && dt.status === "ACTIVE";
    })
    .map((t) => {
      const dt = empMap.get(t.dt_employee_id as string)!;
      const driver = t.driver_rigger_employee_id ? empMap.get(t.driver_rigger_employee_id as string) : null;
      return {
        teamId: t.id as string,
        teamName: (t.name as string)?.trim() || "Team",
        dt: { id: t.dt_employee_id as string, full_name: dt.full_name },
        driver:
          driver && driver.status === "ACTIVE"
            ? { id: t.driver_rigger_employee_id as string, full_name: driver.full_name }
            : null,
      };
    });

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Dashboard
      </Link>
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-5">
        <h1 className="text-2xl font-semibold text-zinc-900">Assign EHS tools</h1>
        <p className="mt-1 text-sm text-zinc-600">
          EHS tools assign to the team DT. Driver/Rigger wear items link to that team&apos;s driver automatically.
        </p>
      </div>
      <PmAssignEhsToolsClient assets={assets ?? []} dtTeams={dtTeams} />
    </div>
  );
}
