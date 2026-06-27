import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { REGION_FALLBACK_TEAM_ID } from "@/lib/transfer-requests/constants";
import { computeTransferAccess } from "@/lib/transfer-requests/access";

type EmpRow = { id: string; full_name: string | null };

function uniqueById(rows: EmpRow[]): EmpRow[] {
  const m = new Map<string, EmpRow>();
  for (const r of rows) {
    if (!m.has(r.id)) m.set(r.id, r);
  }
  return [...m.values()];
}

export type TeamMemberPick = {
  teamId: string;
  teamName: string;
  members: { id: string; full_name: string }[];
};

function flattenExcludedTeams(teams: TeamMemberPick[], excludeId: string): { id: string; full_name: string }[] {
  const map = new Map<string, string>();
  for (const t of teams) {
    for (const m of t.members) {
      if (m.id === excludeId) continue;
      if (!map.has(m.id)) map.set(m.id, m.full_name);
    }
  }
  return [...map.entries()]
    .map(([id, full_name]) => ({ id, full_name }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export type TransferBootstrap = {
  meId: string;
  access: ReturnType<typeof computeTransferAccess>;
  requests: Record<string, unknown>[];
  employees: { id: string; full_name: string }[];
  vehicleSwapDrivers: { id: string; full_name: string }[];
  assetTransferDts: { id: string; full_name: string }[];
  driveSwapTeams: { id: string; name: string; driverId: string; driverName: string }[];
  teamLabels: Record<string, string>;
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

  const { data: regionTeamsFull } = await supabase
    .from("teams")
    .select("id, name, region_id, dt_employee_id, driver_rigger_employee_id")
    .in("region_id", regionIdsForLists);

  const regionIds = (regionEmployees ?? []).map((e) => e.id);
  const teamMemberIds = new Set<string>();
  for (const t of regionTeamsFull ?? []) {
    if (t.dt_employee_id) teamMemberIds.add(t.dt_employee_id as string);
    if (t.driver_rigger_employee_id) teamMemberIds.add(t.driver_rigger_employee_id as string);
  }
  const allRoleIds = [...new Set([...regionIds, ...teamMemberIds])];
  const { data: allRoleRows } = allRoleIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", allRoleIds)
    : { data: [] };

  const roleMap = new Map<string, Set<string>>();
  for (const r of allRoleRows ?? []) {
    if (!roleMap.has(r.employee_id)) roleMap.set(r.employee_id, new Set());
    roleMap.get(r.employee_id)!.add(r.role as string);
  }

  const missingForNames = [...teamMemberIds].filter((id) => !regionIds.includes(id));
  const { data: extraEmployees } = missingForNames.length
    ? await supabase.from("employees").select("id, full_name, status").in("id", missingForNames).eq("status", "ACTIVE")
    : { data: [] };

  const empById = new Map<string, EmpRow>();
  for (const e of regionEmployees ?? []) empById.set(e.id, { id: e.id, full_name: e.full_name });
  for (const e of extraEmployees ?? []) empById.set(e.id, { id: e.id, full_name: e.full_name });

  function isVehicleRole(id: string): boolean {
    const s = roleMap.get(id);
    return !!(s?.has("Driver/Rigger") || s?.has("Self DT"));
  }
  function isAssetRole(id: string): boolean {
    const s = roleMap.get(id);
    return !!(s?.has("DT") || s?.has("Self DT"));
  }

  const vehicleSwapTeams: TeamMemberPick[] = [];
  const coveredDriverIds = new Set<string>();
  for (const t of regionTeamsFull ?? []) {
    const dr = t.driver_rigger_employee_id as string | null;
    if (!dr || dr === employee.id) continue;
    if (!isVehicleRole(dr)) continue;
    const row = empById.get(dr);
    if (!row) continue;
    coveredDriverIds.add(dr);
    vehicleSwapTeams.push({
      teamId: t.id as string,
      teamName: typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team",
      members: [{ id: dr, full_name: row.full_name ?? dr }],
    });
  }
  vehicleSwapTeams.sort((a, b) => a.teamName.localeCompare(b.teamName));

  const regionOnlyDrivers: { id: string; full_name: string }[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isVehicleRole(e.id)) continue;
    if (coveredDriverIds.has(e.id)) continue;
    regionOnlyDrivers.push({ id: e.id, full_name: e.full_name ?? e.id });
  }
  regionOnlyDrivers.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (regionOnlyDrivers.length > 0) {
    vehicleSwapTeams.push({
      teamId: REGION_FALLBACK_TEAM_ID,
      teamName: "Other drivers in your region",
      members: regionOnlyDrivers,
    });
  }

  const assetTransferTeams: TeamMemberPick[] = [];
  const coveredDtIds = new Set<string>();
  for (const t of regionTeamsFull ?? []) {
    const dt = t.dt_employee_id as string | null;
    if (!dt || dt === employee.id) continue;
    if (!isAssetRole(dt)) continue;
    const row = empById.get(dt);
    if (!row) continue;
    coveredDtIds.add(dt);
    assetTransferTeams.push({
      teamId: t.id as string,
      teamName: typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team",
      members: [{ id: dt, full_name: row.full_name ?? dt }],
    });
  }
  assetTransferTeams.sort((a, b) => a.teamName.localeCompare(b.teamName));

  const regionOnlyDts: { id: string; full_name: string }[] = [];
  for (const e of regionEmployees ?? []) {
    if (e.id === employee.id || !isAssetRole(e.id)) continue;
    if (coveredDtIds.has(e.id)) continue;
    regionOnlyDts.push({ id: e.id, full_name: e.full_name ?? e.id });
  }
  regionOnlyDts.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (regionOnlyDts.length > 0) {
    assetTransferTeams.push({
      teamId: REGION_FALLBACK_TEAM_ID,
      teamName: "Other DTs in your region",
      members: regionOnlyDts,
    });
  }

  const driveSwapTeams: { id: string; name: string; driverId: string; driverName: string }[] = [];
  for (const t of regionTeamsFull ?? []) {
    const dr = t.driver_rigger_employee_id as string | null;
    if (!dr || dr === employee.id) continue;
    if (!isVehicleRole(dr)) continue;
    const row = empById.get(dr);
    if (!row) continue;
    driveSwapTeams.push({
      id: t.id as string,
      name: typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team",
      driverId: dr,
      driverName: row.full_name ?? dr,
    });
  }
  driveSwapTeams.sort((a, b) => a.name.localeCompare(b.name));

  const employeesForLabels = uniqueById([
    ...(regionEmployees ?? []).map((e) => ({ id: e.id, full_name: e.full_name })),
    ...vehicleSwapTeams.flatMap((x) => x.members.map((m) => ({ id: m.id, full_name: m.full_name }))),
    ...assetTransferTeams.flatMap((x) => x.members.map((m) => ({ id: m.id, full_name: m.full_name }))),
  ]);

  const teamLabels: Record<string, string> = {};
  for (const t of regionTeamsFull ?? []) {
    teamLabels[t.id as string] = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team";
  }
  teamLabels[REGION_FALLBACK_TEAM_ID] = "Other (region)";

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
    vehicleSwapDrivers: flattenExcludedTeams(vehicleSwapTeams, employee.id),
    assetTransferDts: flattenExcludedTeams(assetTransferTeams, employee.id),
    driveSwapTeams,
    teamLabels,
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
