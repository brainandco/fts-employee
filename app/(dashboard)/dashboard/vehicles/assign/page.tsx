import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadPmScopeIds, loadPmRegionEmployeeOptions } from "@/lib/pm-team-assignees";
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

  const regionCandidates = await loadPmRegionEmployeeOptions(supabase, pmCtx, session.user.id, {
    excludeQc: false,
    vehicleDriversOnly: true,
  });

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

  const regionIds = regionCandidates.map((a) => a.id);
  const { data: empAssignments } = regionIds.length
    ? await supabase.from("vehicle_assignments").select("employee_id").in("employee_id", regionIds)
    : { data: [] };
  const occupiedEmpSet = new Set((empAssignments ?? []).map((r) => r.employee_id));
  const assignees = regionCandidates.filter((a) => !occupiedEmpSet.has(a.id));

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
          Assign to a <strong>Driver/Rigger or Self DT</strong> whose record is in one of your regions (primary or extra regions from Admin). One vehicle per person; people who already have a vehicle are hidden. Use the search field to find the employee.
        </p>
        <p className="mt-3 text-xs font-medium text-zinc-600">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-zinc-200">Eligible drivers: {assignees.length}</span>
        </p>
      </div>
      <PmAssignVehiclesClient vehicles={vehicles} assignees={assignees} />
    </div>
  );
}
