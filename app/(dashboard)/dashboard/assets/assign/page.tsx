import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadPmTeamAssigneeOptions } from "@/lib/pm-team-assignees";
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

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, category, model, serial, imei_1, imei_2, status")
    .eq("status", "Available")
    .or(employee.region_id ? `assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null` : "assigned_region_id.is.null")
    .order("name");

  const assignees = await loadPmTeamAssigneeOptions(
    supabase,
    {
      id: employee.id,
      region_id: employee.region_id,
      project_id: employee.project_id,
    },
    session.user.id
  );

  return (
    <div className="space-y-5">
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <Link href="/dashboard/assets" className="hover:text-zinc-900">Assets</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign to team member</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Assign to team member</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Eligibility uses each team’s region and project from Admin (not each field employee’s profile). Listed teams match your PM access: teams aligned to your region/project when those are set on your record, plus teams under projects where you are the project PM.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
            Team slots: {assignees.length}
          </span>
          <Link href="/dashboard/assets" className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">← Back to assets</Link>
        </div>
      </div>
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">Eligible assignees (from your teams)</h2>
        {assignees.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            No teams with DT or Driver/Rigger in scope. In Admin, set region and project on each team, assign DT and Driver/Rigger, or assign you as project PM on the project that owns the team.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {assignees.map((a) => (
              <span key={a.id} className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800">
                {a.label}
              </span>
            ))}
          </div>
        )}
      </section>
      <PmAssignToEmployeeClient assets={assets ?? []} assignees={assignees} />
    </div>
  );
}
