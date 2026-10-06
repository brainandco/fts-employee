import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { computeTransferAccess } from "@/lib/transfer-requests/access";

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

export type TransferBootstrap = {
  meId: string;
  access: ReturnType<typeof computeTransferAccess>;
  requests: Record<string, unknown>[];
  employees: { id: string; full_name: string }[];
  vehicleSwapDrivers: { id: string; full_name: string }[];
  assetTransferDts: { id: string; full_name: string }[];
  myAssets: { id: string; name: string; serial: string | null; category: string | null }[];
  replacementVehicles: { id: string; plate_number: string; make: string | null; model: string | null }[];
};

export async function loadTransferBootstrap(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<TransferBootstrap | { error: string }> {
  if (!employee.region_id) return { error: "Your employee record has no region." };

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role as string));
  const access = computeTransferAccess(roleSet);
  if (!access.canRequest && !access.canReview) return { error: "You do not have access to transfer requests." };

  const { allowedRegionIds: pmAllowedRegionIds } = access.isPm
    ? await loadPmScopeIds(
        supabase,
        { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
        authUserId
      )
    : { allowedRegionIds: [] as string[] };

  const regionIdsForLists = access.canRequest
    ? [employee.region_id]
    : access.isPm && access.canReview && pmAllowedRegionIds.length > 0
      ? pmAllowedRegionIds
      : [employee.region_id];

  let requestsQuery = supabase.from("transfer_requests").select("*").order("created_at", { ascending: false });
  if (access.canReview) {
    if (access.isPm) {
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
  if (access.canReview && access.isPm && pmAllowedRegionIds.length > 0) {
    const orParts = [...pmAllowedRegionIds.map((id) => `assigned_region_id.eq.${id}`), "assigned_region_id.is.null"];
    replacementVehiclesQuery = replacementVehiclesQuery.or(orParts.join(","));
  } else {
    replacementVehiclesQuery = replacementVehiclesQuery.or(
      `assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null`
    );
  }
  const { data: replacementVehicles } = await replacementVehiclesQuery.order("plate_number");

  return {
    meId: employee.id,
    access,
    requests: (requests ?? []) as Record<string, unknown>[],
    employees: employeesForLabels.map((e) => ({ id: e.id, full_name: e.full_name ?? e.id })),
    vehicleSwapDrivers,
    assetTransferDts,
    myAssets: (myAssets ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      serial: (a.serial as string | null) ?? null,
      category: (a.category as string | null) ?? null,
    })),
    replacementVehicles: (replacementVehicles ?? []).map((v) => ({
      id: v.id as string,
      plate_number: v.plate_number as string,
      make: (v.make as string | null) ?? null,
      model: (v.model as string | null) ?? null,
    })),
  };
}
