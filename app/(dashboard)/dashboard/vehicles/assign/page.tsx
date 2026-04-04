import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  loadPmTeamAssigneeOptions,
  loadPmScopeIds,
  loadPmRegionEmployeeOptions,
} from "@/lib/pm-team-assignees";
import { PmAssignVehiclesClient } from "./PmAssignVehiclesClient";

export default async function PmAssignVehiclesPage() {
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
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pmCtx, session.user.id);
  const vehiclesRegionOr =
    allowedRegionIds.length > 0
      ? `assigned_region_id.is.null,assigned_region_id.in.(${allowedRegionIds.join(",")})`
      : "assigned_region_id.is.null";

  const teamAssignees = await loadPmTeamAssigneeOptions(supabase, pmCtx, session.user.id);
  const teamIds = teamAssignees.map((a) => a.id);
  const { data: vehicleRoles } = teamIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", teamIds)
    : { data: [] };
  const vehicleRoleOk = new Set<string>();
  for (const r of vehicleRoles ?? []) {
    if (r.role === "Driver/Rigger" || r.role === "Self DT") vehicleRoleOk.add(r.employee_id);
  }
  const candidateTeamAssignees = teamAssignees.filter((a) => vehicleRoleOk.has(a.id));

  const { data: candidates } = await supabase
    .from("vehicles")
    .select("id, plate_number, vehicle_type, rent_company, make, model, assigned_region_id, status")
    .eq("status", "Available")
    .or(vehiclesRegionOr)
    .order("plate_number");

  const vehicleIds = (candidates ?? []).map((v) => v.id);
  const { data: assignedRows } = vehicleIds.length
    ? await supabase.from("vehicle_assignments").select("vehicle_id").in("vehicle_id", vehicleIds)
    : { data: [] };
  const assignedSet = new Set((assignedRows ?? []).map((r) => r.vehicle_id));
  const vehicles = (candidates ?? []).filter((v) => !assignedSet.has(v.id));

  const regionCandidates = await loadPmRegionEmployeeOptions(supabase, pmCtx, session.user.id, {
    excludeQc: false,
    vehicleDriversOnly: true,
  });

  const mergeIds = [...new Set([...candidateTeamAssignees.map((a) => a.id), ...regionCandidates.map((a) => a.id)])];
  const { data: empAssignments } = mergeIds.length
    ? await supabase.from("vehicle_assignments").select("employee_id").in("employee_id", mergeIds)
    : { data: [] };
  const occupiedEmpSet = new Set((empAssignments ?? []).map((r) => r.employee_id));

  const teamAssigneesFiltered = candidateTeamAssignees.filter((a) => !occupiedEmpSet.has(a.id));
  const regionAssigneesFiltered = regionCandidates.filter((a) => !occupiedEmpSet.has(a.id));

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign vehicles</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Assign vehicles</h1>
        <p className="mt-1 text-sm text-zinc-600">
          By team: Driver/Rigger or Self DT on a team in your PM scope. By region: Driver/Rigger or Self DT whose employee record is in one of your regions. One vehicle per person; people who already have a vehicle are hidden.
        </p>
      </div>
      <PmAssignVehiclesClient vehicles={vehicles} teamAssignees={teamAssigneesFiltered} regionAssignees={regionAssigneesFiltered} />
    </div>
  );
}
