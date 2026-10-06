import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { TransferRequestsClient } from "./TransferRequestsClient";

type EmpRow = { id: string; full_name: string | null };

function uniqueById(rows: EmpRow[]): EmpRow[] {
  const m = new Map<string, EmpRow>();
  for (const r of rows) {
    if (!m.has(r.id)) m.set(r.id, r);
  }
  return [...m.values()];
}

function regionEmployeesWithRole(
  regionEmployees: { id: string; full_name: string | null }[],
  roleMap: Map<string, Set<string>>,
  meId: string,
  hasRole: (roles: Set<string>) => boolean
): { id: string; full_name: string }[] {
  return regionEmployees
    .filter((e) => e.id !== meId && hasRole(roleMap.get(e.id) ?? new Set()))
    .map((e) => ({ id: e.id, full_name: e.full_name ?? e.id }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export default async function TransferRequestsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id, full_name, status")
    .eq("email", email)
    .maybeSingle();
  if (!employee || employee.status !== "ACTIVE" || !employee.region_id) redirect("/dashboard");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isSelfDt = roleSet.has("Self DT");
  const canRequestAssetTransfer =
    roleSet.has("DT") ||
    roleSet.has("Junior DT") ||
    roleSet.has("PP") ||
    roleSet.has("Reporting Team") ||
    isSelfDt;
  const canRequestVehicleFlows = roleSet.has("Driver/Rigger") || isSelfDt;
  const canRequest = canRequestAssetTransfer || canRequestVehicleFlows;
  const canReview = roleSet.has("QC") || roleSet.has("Project Manager");
  if (!canRequest && !canReview) redirect("/dashboard");

  const isPm = roleSet.has("Project Manager");
  const { allowedRegionIds: pmAllowedRegionIds } = isPm
    ? await loadPmScopeIds(
        supabase,
        { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
        session.user.id
      )
    : { allowedRegionIds: [] as string[] };

  const regionIdsForLists = canRequest
    ? employee.region_id
      ? [employee.region_id]
      : []
    : isPm && canReview && pmAllowedRegionIds.length > 0
      ? pmAllowedRegionIds
      : employee.region_id
        ? [employee.region_id]
        : [];

  let requestsQuery = supabase.from("transfer_requests").select("*").order("created_at", { ascending: false });
  if (canReview) {
    if (isPm) {
      if (pmAllowedRegionIds.length === 0) {
        requestsQuery = requestsQuery.eq("requester_employee_id", employee.id);
      } else if (pmAllowedRegionIds.length === 1) {
        requestsQuery = requestsQuery.or(
          `requester_employee_id.eq.${employee.id},requester_region_id.eq.${pmAllowedRegionIds[0]}`
        );
      } else {
        requestsQuery = requestsQuery.or(
          `requester_employee_id.eq.${employee.id},requester_region_id.in.(${pmAllowedRegionIds.join(",")})`
        );
      }
    } else {
      requestsQuery = requestsQuery.or(
        `requester_employee_id.eq.${employee.id},requester_region_id.eq.${employee.region_id}`
      );
    }
  } else {
    requestsQuery = requestsQuery.eq("requester_employee_id", employee.id);
  }
  const { data: requests } = await requestsQuery;

  const { data: regionEmployees } = await supabase
    .from("employees")
    .select("id, full_name, region_id, status")
    .in("region_id", regionIdsForLists)
    .eq("status", "ACTIVE");

  const regionEmployeeIds = (regionEmployees ?? []).map((e) => e.id);
  const { data: allRoleRows } = regionEmployeeIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", regionEmployeeIds)
    : { data: [] };

  const roleMap = new Map<string, Set<string>>();
  for (const r of allRoleRows ?? []) {
    if (!roleMap.has(r.employee_id)) roleMap.set(r.employee_id, new Set());
    roleMap.get(r.employee_id)!.add(r.role as string);
  }

  const vehicleSwapDrivers = regionEmployeesWithRole(
    regionEmployees ?? [],
    roleMap,
    employee.id,
    (s) => s.has("Driver/Rigger") || s.has("Self DT")
  );
  const assetTransferDts = regionEmployeesWithRole(
    regionEmployees ?? [],
    roleMap,
    employee.id,
    (s) => s.has("DT") || s.has("Self DT")
  );

  const employeesForLabels = uniqueById(
    (regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name }))
  );

  const { data: myAssets } = await supabase
    .from("assets")
    .select("id, name, serial, category, assigned_to_employee_id, status")
    .eq("assigned_to_employee_id", employee.id)
    .eq("status", "Assigned");

  let replacementVehiclesQuery = supabase
    .from("vehicles")
    .select("id, plate_number, make, model, status, assigned_region_id, assignment_type")
    .eq("assignment_type", "Temporary")
    .eq("status", "Available");
  if (canReview && isPm && pmAllowedRegionIds.length > 0) {
    const orParts = [
      ...pmAllowedRegionIds.map((id) => `assigned_region_id.eq.${id}`),
      "assigned_region_id.is.null",
    ];
    replacementVehiclesQuery = replacementVehiclesQuery.or(orParts.join(","));
  } else {
    replacementVehiclesQuery = replacementVehiclesQuery.or(
      `assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null`
    );
  }
  const { data: replacementVehicles } = await replacementVehiclesQuery.order("plate_number");

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Transfer requests</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Transfer requests</h1>
        <p className="fts-page-desc">
          Request a vehicle swap or replacement, or transfer an assigned asset to another DT in your region. Pick the other driver or DT directly from eligible colleagues in your region.
        </p>
      </div>

      <TransferRequestsClient
        canRequest={canRequest}
        canReview={canReview}
        canRequestAssetTransfer={canRequestAssetTransfer}
        canRequestVehicleFlows={canRequestVehicleFlows}
        meId={employee.id}
        requests={(requests ?? []) as never[]}
        employees={employeesForLabels.map((e) => ({
          id: e.id,
          full_name: e.full_name ?? e.id,
        }))}
        vehicleSwapDrivers={vehicleSwapDrivers}
        assetTransferDts={assetTransferDts}
        myAssets={(myAssets ?? []).map((a) => ({ id: a.id, name: a.name, serial: a.serial, category: a.category ?? null }))}
        replacementVehicles={(replacementVehicles ?? []).map((v) => ({ id: v.id, plate_number: v.plate_number, make: v.make, model: v.model }))}
      />
    </div>
  );
}
