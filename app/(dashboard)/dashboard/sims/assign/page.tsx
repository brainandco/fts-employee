import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  loadPmTeamAssigneeOptions,
  loadPmRegionEmployeeOptions,
} from "@/lib/pm-team-assignees";
import { PmAssignSimsClient } from "./PmAssignSimsClient";

export default async function PmAssignSimsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) redirect("/login");

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", session.user.email ?? "")
    .maybeSingle();
  if (!employee) redirect("/login");

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) redirect("/dashboard");

  const pmCtx = {
    id: employee.id,
    region_id: employee.region_id,
    project_id: employee.project_id,
  };

  const { data: sims } = await supabase
    .from("sim_cards")
    .select("id, operator, service_type, sim_number, phone_number, status")
    .eq("status", "Available")
    .order("sim_number");

  const teamAssignees = await loadPmTeamAssigneeOptions(supabase, pmCtx, session.user.id);
  const regionAssignees = await loadPmRegionEmployeeOptions(supabase, pmCtx, session.user.id, {
    excludeQc: true,
    vehicleDriversOnly: false,
  });

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign SIMs</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Assign SIMs</h1>
        <p className="mt-1 text-sm text-zinc-600">
          By team: DT or Driver/Rigger on a team in your PM scope. By region: any active employee in your regions (QC excluded).
        </p>
      </div>
      <PmAssignSimsClient sims={(sims ?? []).map((s) => ({ ...s }))} teamAssignees={teamAssignees} regionAssignees={regionAssignees} />
    </div>
  );
}
