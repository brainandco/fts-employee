import type { SupabaseClient } from "@supabase/supabase-js";

/** PM employee row (optional region/project on the employee record — used only to narrow teams when set). */
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

/**
 * Teams the PM may assign into. Scope is based on **team** region/project (Admin), not on field employees’ personal region rows.
 *
 * - When the PM employee has `region_id` (and optionally `project_id`), include teams whose `teams.region_id` matches, and when `project_id` is set on the PM, `teams.project_id` must match.
 * - Always merge teams under **projects** where `projects.pm_user_id` is this auth user (portal login), so PM access works even when region is only stored on teams/projects.
 */
async function fetchTeamsForPmScope(
  supabase: SupabaseClient,
  pm: PmContext,
  authUserId: string | null
): Promise<TeamRow[]> {
  const byId = new Map<string, TeamRow>();

  if (pm.region_id) {
    let q = supabase
      .from("teams")
      .select("id, name, dt_employee_id, driver_rigger_employee_id")
      .eq("region_id", pm.region_id);
    if (pm.project_id) {
      q = q.eq("project_id", pm.project_id);
    }
    const { data, error } = await q;
    if (!error) {
      for (const t of data ?? []) {
        byId.set(t.id as string, t as TeamRow);
      }
    }
  }

  if (authUserId) {
    const { data: projs } = await supabase.from("projects").select("id").eq("pm_user_id", authUserId);
    const pids = (projs ?? []).map((p) => p.id as string).filter(Boolean);
    if (pids.length) {
      const { data: teamsB } = await supabase
        .from("teams")
        .select("id, name, dt_employee_id, driver_rigger_employee_id")
        .in("project_id", pids);
      for (const t of teamsB ?? []) {
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

/** True if the target is DT or Driver/Rigger on a team in the PM’s assignable scope (team region/project + project PM). */
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
