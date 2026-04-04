import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  loadPmTeamAssigneeOptions,
  loadPmScopeIds,
  loadPmRegionEmployeeOptions,
} from "@/lib/pm-team-assignees";
import { PmAssignToEmployeeClient } from "./PmAssignToEmployeeClient";

export default async function PmAssignAssetPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session?.user?.id) redirect("/login");

  const email = (session.user.email ?? "").trim();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) redirect("/login");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  if (!isPm) redirect("/dashboard");

  const pmCtx = {
    id: employee.id,
    region_id: employee.region_id,
    project_id: employee.project_id,
  };
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pmCtx, session.user.id);
  const assetsRegionOr =
    allowedRegionIds.length > 0
      ? `assigned_region_id.is.null,assigned_region_id.in.(${allowedRegionIds.join(",")})`
      : "assigned_region_id.is.null";

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, category, model, serial, imei_1, imei_2, status")
    .eq("status", "Available")
    .or(assetsRegionOr)
    .order("name");

  const teamAssignees = await loadPmTeamAssigneeOptions(supabase, pmCtx, session.user.id);
  const regionAssignees = await loadPmRegionEmployeeOptions(supabase, pmCtx, session.user.id, {
    excludeQc: true,
    vehicleDriversOnly: false,
  });

  return (
    <div className="space-y-5">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <Link href="/dashboard/assets" className="hover:text-zinc-900">Assets</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign assets</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Assign assets</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Choose By team to assign to DT or Driver/Rigger on teams in your PM scope. Choose By region to assign to any active employee in your regions (primary and any extra regions set in Admin). QC cannot receive assets.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            Team: {teamAssignees.length} · Region: {regionAssignees.length}
          </span>
          <Link href="/dashboard/assets" className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">← Back to assets</Link>
        </div>
      </div>
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">Who you can assign to</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Preview lists for each mode (use the selector below to switch).
        </p>
        {teamAssignees.length === 0 && regionAssignees.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No team slots in scope and no employees in your regions. Check Admin for teams, regions, and PM project access.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-medium text-zinc-700">By team ({teamAssignees.length})</p>
            <div className="flex flex-wrap gap-2">
              {teamAssignees.length === 0 ? (
                <span className="text-zinc-500">None</span>
              ) : (
                teamAssignees.map((a) => (
                  <span key={a.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800">
                    {a.label}
                  </span>
                ))
              )}
            </div>
            <p className="font-medium text-zinc-700">By region ({regionAssignees.length})</p>
            <div className="flex flex-wrap gap-2">
              {regionAssignees.length === 0 ? (
                <span className="text-zinc-500">None</span>
              ) : (
                regionAssignees.map((a) => (
                  <span key={a.id} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                    {a.label}
                  </span>
                ))
              )}
            </div>
          </div>
        )}
      </section>
      <PmAssignToEmployeeClient assets={assets ?? []} teamAssignees={teamAssignees} regionAssignees={regionAssignees} />
    </div>
  );
}
