import type { SupabaseClient } from "@supabase/supabase-js";

/** PM employee row (primary region/project on employees record; extras come from pm_region_assignments / pm_employee_projects). */
export type PmContext = {
  id: string;
  region_id: string | null;
  project_id: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  dt_employee_id: string | null;
  driver_rigger_employee_id: string | null;
};

/** Primary + extra PM regions (for asset pools and region-based assignment). */
export async function loadPmScopeIds(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string | null
): Promise<{ allowedRegionIds: string[]; allowedProjectIds: string[] }> {
  const { data: extraRegions } = await supabase
    .from("pm_region_assignments")
    .select("region_id")
    .eq("employee_id", pm.id);

  const { data: pmProjects } = await supabase
    .from("pm_employee_projects")
    .select("project_id")
    .eq("employee_id", pm.id);

  const allowedRegionIds = [
    ...new Set(
      [...(pm.region_id ? [pm.region_id] : []), ...((extraRegions ?? []).map((r) => r.region_id as string).filter(Boolean))]
    ),
  ];

  const fromJunction = (pmProjects ?? []).map((p) => p.project_id as string).filter(Boolean);
  const { data: authProjects } = authUserId
    ? await supabase.from("projects").select("id").eq("pm_user_id", authUserId)
    : { data: [] };
  const fromAuth = (authProjects ?? []).map((p) => p.id as string).filter(Boolean);

  const allowedProjectIds = [...new Set([...fromJunction, ...fromAuth])];

  return { allowedRegionIds, allowedProjectIds };
}

/**
 * Teams the PM may assign into. Union of:
 * - Teams on any project in pm_employee_projects ∪ projects.pm_user_id (portal user).
 * - Teams in primary region ∪ pm_region_assignments (same region, different projects).
 */
async function fetchTeamsForPmScope(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string | null
): Promise<TeamRow[]> {
  const { allowedRegionIds, allowedProjectIds } = await loadPmScopeIds(supabase, pm, authUserId);
  const byId = new Map<string, TeamRow>();

  if (allowedProjectIds.length > 0) {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, dt_employee_id, driver_rigger_employee_id")
      .in("project_id", allowedProjectIds);
    if (!error) {
      for (const t of data ?? []) {
        byId.set(t.id as string, t as TeamRow);
      }
    }
  }

  if (allowedRegionIds.length > 0) {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name, dt_employee_id, driver_rigger_employee_id")
      .in("region_id", allowedRegionIds);
    if (!error) {
      for (const t of data ?? []) {
        byId.set(t.id as string, t as TeamRow);
      }
    }
  }

  return [...byId.values()];
}

/**
 * DT and Driver/Rigger slots on teams the PM can assign to (labels show team context).
 */
export async function loadPmTeamAssigneeOptions(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string | null
): Promise<{ id: string; label: string }[]> {
  const teams = await fetchTeamsForPmScope(supabase, pm, authUserId);
  if (teams.length === 0) return [];

  const rows: { employeeId: string; teamName: string; slot: string }[] = [];
  for (const t of teams) {
    const teamName = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team";
    if (t.dt_employee_id) {
      rows.push({ employeeId: t.dt_employee_id, teamName, slot: "DT" });
    }
    if (t.driver_rigger_employee_id) {
      rows.push({
        employeeId: t.driver_rigger_employee_id,
        teamName,
        slot: "Driver/Rigger",
      });
    }
  }
  if (rows.length === 0) return [];

  const uniqueIds = [...new Set(rows.map((r) => r.employeeId))];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", uniqueIds)
    .eq("status", "ACTIVE");
  const nameMap = new Map((emps ?? []).map((e) => [e.id as string, (e.full_name as string) || ""]));

  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const r of rows) {
    if (r.employeeId === pm.id) continue;
    if (seen.has(r.employeeId)) continue;
    seen.add(r.employeeId);
    const name = nameMap.get(r.employeeId) ?? r.employeeId;
    out.push({
      id: r.employeeId,
      label: `${r.teamName} — ${r.slot}: ${name}`,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** True if the target is DT or Driver/Rigger on a team in the PM’s assignable scope. */
export async function targetEmployeeIsOnPmTeam(
  supabase: SupabaseClient,
  pm: PmContext,
  targetEmployeeId: string,
  authUserId: string | null
): Promise<boolean> {
  const teams = await fetchTeamsForPmScope(supabase, pm, authUserId);
  return teams.some(
    (t) =>
      t.dt_employee_id === targetEmployeeId || t.driver_rigger_employee_id === targetEmployeeId
  );
}

export type PmRegionAssigneeOptions = {
  /** Exclude employees with the QC role (assets, SIMs). */
  excludeQc: boolean;
  /** Only Driver/Rigger or Self DT (vehicles). */
  vehicleDriversOnly: boolean;
};

/**
 * Active employees in the PM’s allowed regions (primary + pm_region_assignments), excluding self.
 * Optional QC exclusion and vehicle-driver filter.
 */
export async function loadPmRegionEmployeeOptions(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string | null,
  options: PmRegionAssigneeOptions
): Promise<{ id: string; label: string }[]> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pm, authUserId);
  if (allowedRegionIds.length === 0) return [];

  const { data: emps, error } = await supabase
    .from("employees")
    .select("id, full_name, region_id")
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE")
    .neq("id", pm.id);
  if (error || !emps?.length) return [];

  let filtered = [...emps];

  if (options.excludeQc) {
    const ids = filtered.map((e) => e.id as string);
    const { data: qcRows } = await supabase.from("employee_roles").select("employee_id").eq("role", "QC").in("employee_id", ids);
    const qcSet = new Set((qcRows ?? []).map((r) => r.employee_id as string));
    filtered = filtered.filter((e) => !qcSet.has(e.id as string));
  }

  if (options.vehicleDriversOnly) {
    const ids = filtered.map((e) => e.id as string);
    if (ids.length === 0) return [];
    const { data: roleRows } = await supabase
      .from("employee_roles")
      .select("employee_id")
      .in("employee_id", ids)
      .in("role", ["Driver/Rigger", "Self DT"]);
    const ok = new Set((roleRows ?? []).map((r) => r.employee_id as string));
    filtered = filtered.filter((e) => ok.has(e.id as string));
  }

  const regionIds = [...new Set(filtered.map((e) => e.region_id).filter(Boolean))] as string[];
  const { data: regions } = regionIds.length
    ? await supabase.from("regions").select("id, name").in("id", regionIds)
    : { data: [] };
  const regionMap = new Map((regions ?? []).map((r) => [r.id as string, (r.name as string) || ""]));

  return filtered
    .map((e) => {
      const rid = e.region_id as string | null;
      const rn = rid ? regionMap.get(rid) : "";
      const suffix = rn ? ` — ${rn}` : "";
      return {
        id: e.id as string,
        label: `${(e.full_name as string) || e.id}${suffix}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type PmRegionTargetValidation = {
  excludeQc: boolean;
  requireVehicleRoles: boolean;
};

/** True if the target is an active employee in one of the PM’s regions and passes role gates. */
export async function targetEmployeeIsInPmRegionScope(
  supabase: SupabaseClient,
  pm: PmContext,
  targetEmployeeId: string,
  authUserId: string | null,
  validation: PmRegionTargetValidation
): Promise<boolean> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, pm, authUserId);
  if (allowedRegionIds.length === 0) return false;

  const { data: target } = await supabase
    .from("employees")
    .select("id, region_id, status")
    .eq("id", targetEmployeeId)
    .maybeSingle();
  if (!target || target.status !== "ACTIVE") return false;
  if (target.id === pm.id) return false;
  const tr = target.region_id as string | null;
  if (!tr || !allowedRegionIds.includes(tr)) return false;

  if (validation.excludeQc) {
    const { data: qc } = await supabase
      .from("employee_roles")
      .select("role")
      .eq("employee_id", targetEmployeeId)
      .eq("role", "QC")
      .maybeSingle();
    if (qc) return false;
  }

  if (validation.requireVehicleRoles) {
    const { data: vr } = await supabase
      .from("employee_roles")
      .select("role")
      .eq("employee_id", targetEmployeeId)
      .in("role", ["Driver/Rigger", "Self DT"])
      .limit(1);
    if (!(vr ?? []).length) return false;
  }

  return true;
}

/** Team slot or region employee — used when fulfilling QC requests, etc. */
export async function targetEmployeeIsInPmAssignmentScope(
  supabase: SupabaseClient,
  pm: PmContext,
  targetEmployeeId: string,
  authUserId: string | null,
  regionValidation: PmRegionTargetValidation
): Promise<boolean> {
  const onTeam = await targetEmployeeIsOnPmTeam(supabase, pm, targetEmployeeId, authUserId);
  if (onTeam) return true;
  return targetEmployeeIsInPmRegionScope(supabase, pm, targetEmployeeId, authUserId, regionValidation);
}
