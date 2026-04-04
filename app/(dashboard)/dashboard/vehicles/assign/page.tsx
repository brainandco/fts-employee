import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadPmTeamAssigneeOptions } from "@/lib/pm-team-assignees";
import { PmAssignVehiclesClient } from "./PmAssignVehiclesClient";

export default async function PmAssignVehiclesPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

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

  const teamAssignees = await loadPmTeamAssigneeOptions(supabase, {
    id: employee.id,
    region_id: employee.region_id,
    project_id: employee.project_id,
  });
  const teamIds = teamAssignees.map((a) => a.id);
  const { data: vehicleRoles } = teamIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", teamIds)
    : { data: [] };
  const vehicleRoleOk = new Set<string>();
  for (const r of vehicleRoles ?? []) {
    if (r.role === "Driver/Rigger" || r.role === "Self DT") vehicleRoleOk.add(r.employee_id);
  }
  const candidateAssignees = teamAssignees.filter((a) => vehicleRoleOk.has(a.id));

  const vehiclesQuery = employee.region_id
    ? supabase
        .from("vehicles")
        .select("id, plate_number, vehicle_type, rent_company, make, model, assigned_region_id, status")
        .eq("status", "Available")
        .or(`assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null`)
    : supabase
        .from("vehicles")
        .select("id, plate_number, vehicle_type, rent_company, make, model, assigned_region_id, status")
        .eq("status", "Available")
        .is("assigned_region_id", null);
  const { data: candidates } = await vehiclesQuery.order("plate_number");

  const vehicleIds = (candidates ?? []).map((v) => v.id);
  const { data: assignedRows } = vehicleIds.length
    ? await supabase.from("vehicle_assignments").select("vehicle_id").in("vehicle_id", vehicleIds)
    : { data: [] };
  const assignedSet = new Set((assignedRows ?? []).map((r) => r.vehicle_id));
  const vehicles = (candidates ?? []).filter((v) => !assignedSet.has(v.id));

  const assigneeIds = candidateAssignees.map((a) => a.id);
  const { data: empAssignments } = assigneeIds.length
    ? await supabase.from("vehicle_assignments").select("employee_id").in("employee_id", assigneeIds)
    : { data: [] };
  const occupiedEmpSet = new Set((empAssignments ?? []).map((r) => r.employee_id));
  const assignees = candidateAssignees.filter((a) => !occupiedEmpSet.has(a.id));

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign vehicles</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Assign vehicles to team members</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Assign to Driver/Rigger or Self DT on a team in your region
          {employee.project_id ? " and project" : ""}. One vehicle per person; already assigned people are hidden.
        </p>
      </div>
      <PmAssignVehiclesClient vehicles={vehicles} assignees={assignees} />
    </div>
  );
}
