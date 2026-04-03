import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PmAssignVehiclesClient } from "./PmAssignVehiclesClient";

export default async function PmAssignVehiclesPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id")
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

  const employeesQuery = employee.region_id
    ? supabase.from("employees").select("id, full_name").eq("status", "ACTIVE").eq("region_id", employee.region_id)
    : supabase.from("employees").select("id, full_name").eq("status", "ACTIVE").is("region_id", null);
  const { data: allInRegion } = await employeesQuery;
  const regionEmpIds = (allInRegion ?? []).map((e) => e.id);
  const { data: roleRows } = regionEmpIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", regionEmpIds)
    : { data: [] };
  const rolesByEmp = new Map<string, Set<string>>();
  for (const r of roleRows ?? []) {
    if (!rolesByEmp.has(r.employee_id)) rolesByEmp.set(r.employee_id, new Set());
    rolesByEmp.get(r.employee_id)!.add(r.role);
  }
  const candidateEmployees = (allInRegion ?? []).filter((e) => {
    if (e.id === employee.id) return false;
    const set = rolesByEmp.get(e.id) ?? new Set<string>();
    return set.has("Driver/Rigger") || set.has("Self DT");
  });
  const employeeIds = candidateEmployees.map((e) => e.id);
  const { data: empAssignments } = employeeIds.length
    ? await supabase.from("vehicle_assignments").select("employee_id").in("employee_id", employeeIds)
    : { data: [] };
  const occupiedEmpSet = new Set((empAssignments ?? []).map((r) => r.employee_id));
  const employees = candidateEmployees.filter((e) => !occupiedEmpSet.has(e.id));

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Assign vehicles</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Assign vehicles to employees</h1>
        <p className="mt-1 text-sm text-zinc-600">
          PM-only assignment. Available and unassigned vehicles are listed below. You can assign only to available employees in your region.
        </p>
      </div>
      <PmAssignVehiclesClient vehicles={vehicles} employees={employees} />
    </div>
  );
}
