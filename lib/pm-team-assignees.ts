import type { SupabaseClient } from "@supabase/supabase-js";

/** PM employee row (region/project from employees table). */
export type PmContext = {
  id: string;
  region_id: string | null;
  project_id: string | null;
};

/**
 * Teams in the PM's region; when the PM has a formal project, only teams for that project.
 * Assignees are DT and Driver/Rigger slots (the people who receive tools, vehicles, SIMs).
 */
export async function loadPmTeamAssigneeOptions(
  supabase: SupabaseClient,
  pm: PmContext
): Promise<{ id: string; label: string }[]> {
  if (!pm.region_id) return [];

  let q = supabase
    .from("teams")
    .select("id, name, dt_employee_id, driver_rigger_employee_id, region_id, project_id")
    .eq("region_id", pm.region_id);
  if (pm.project_id) {
    q = q.eq("project_id", pm.project_id);
  }
  const { data: teams, error } = await q;
  if (error || !teams?.length) return [];

  const rows: { employeeId: string; teamName: string; slot: string }[] = [];
  for (const t of teams) {
    const teamName = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Team";
    if (t.dt_employee_id) {
      rows.push({ employeeId: t.dt_employee_id as string, teamName, slot: "DT" });
    }
    if (t.driver_rigger_employee_id) {
      rows.push({
        employeeId: t.driver_rigger_employee_id as string,
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

/** True if the target is DT or Driver/Rigger on a team scoped to this PM (region + optional project). */
export async function targetEmployeeIsOnPmTeam(
  supabase: SupabaseClient,
  pm: PmContext,
  targetEmployeeId: string
): Promise<boolean> {
  if (!pm.region_id) return false;

  let q = supabase
    .from("teams")
    .select("id")
    .eq("region_id", pm.region_id)
    .or(`dt_employee_id.eq.${targetEmployeeId},driver_rigger_employee_id.eq.${targetEmployeeId}`);
  if (pm.project_id) {
    q = q.eq("project_id", pm.project_id);
  }
  const { data, error } = await q.limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
