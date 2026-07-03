import type { SupabaseClient } from "@supabase/supabase-js";
import { getEhsToolType } from "@/lib/assets/ehs-tool-catalog";

export type EhsToolLine = {
  id: string;
  asset_id: string | null;
  name: string;
  ehs_tool_type: string | null;
  ehs_wear_role: string | null;
  en_code: string | null;
  status: string;
  ehs_for_employee_id: string | null;
};

export type TeamEhsBlock = {
  teamId: string;
  teamName: string;
  regionLabel: string;
  dt: { id: string; full_name: string };
  driver: { id: string; full_name: string } | null;
  dtTools: EhsToolLine[];
  driverTools: EhsToolLine[];
};

export async function loadTeamEhsAssignments(
  supabase: SupabaseClient,
  options?: { regionId?: string | null; regionIds?: string[]; dtEmployeeIds?: string[] }
): Promise<TeamEhsBlock[]> {
  let teamsQuery = supabase
    .from("teams")
    .select("id, name, region_id, dt_employee_id, driver_rigger_employee_id")
    .not("dt_employee_id", "is", null)
    .order("name");

  if (options?.regionId) teamsQuery = teamsQuery.eq("region_id", options.regionId);
  if (options?.regionIds?.length) teamsQuery = teamsQuery.in("region_id", options.regionIds);
  if (options?.dtEmployeeIds?.length) teamsQuery = teamsQuery.in("dt_employee_id", options.dtEmployeeIds);

  const { data: teams } = await teamsQuery;
  const dtIds = (teams ?? []).map((t) => t.dt_employee_id).filter(Boolean) as string[];
  if (dtIds.length === 0) return [];

  const { data: ehsAssets } = await supabase
    .from("assets")
    .select(
      "id, asset_id, name, ehs_tool_type, ehs_wear_role, en_code, status, assigned_to_employee_id, ehs_for_employee_id"
    )
    .eq("is_ehs_tool", true)
    .in("assigned_to_employee_id", dtIds)
    .in("status", ["Assigned", "Under_Maintenance", "Damaged", "With_QC", "Pending_Return"]);

  const byDt = new Map<string, EhsToolLine[]>();
  for (const a of ehsAssets ?? []) {
    const dtId = a.assigned_to_employee_id as string;
    const list = byDt.get(dtId) ?? [];
    list.push({
      id: a.id as string,
      asset_id: a.asset_id as string | null,
      name: (a.name as string) ?? getEhsToolType(a.ehs_tool_type as string)?.label ?? "EHS tool",
      ehs_tool_type: a.ehs_tool_type as string | null,
      ehs_wear_role: a.ehs_wear_role as string | null,
      en_code: a.en_code as string | null,
      status: a.status as string,
      ehs_for_employee_id: a.ehs_for_employee_id as string | null,
    });
    byDt.set(dtId, list);
  }

  const empIds = [
    ...new Set(
      (teams ?? []).flatMap((t) => [t.dt_employee_id, t.driver_rigger_employee_id].filter(Boolean) as string[])
    ),
  ];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name, email").in("id", empIds)
    : { data: [] };
  const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name ?? e.email ?? "—"]));

  const regionIds = [...new Set((teams ?? []).map((t) => t.region_id).filter(Boolean) as string[])];
  const { data: regions } = regionIds.length
    ? await supabase.from("regions").select("id, name, code").in("id", regionIds)
    : { data: [] };
  const regionMap = new Map((regions ?? []).map((r) => [r.id, `${r.name}${r.code ? ` · ${r.code}` : ""}`]));

  const blocks: TeamEhsBlock[] = [];
  for (const t of teams ?? []) {
    const dtId = t.dt_employee_id as string;
    const tools = byDt.get(dtId) ?? [];
    if (tools.length === 0) continue;

    blocks.push({
      teamId: t.id as string,
      teamName: (t.name as string)?.trim() || "Team",
      regionLabel: t.region_id ? (regionMap.get(t.region_id as string) ?? "—") : "No region",
      dt: { id: dtId, full_name: empMap.get(dtId) ?? "DT" },
      driver: t.driver_rigger_employee_id
        ? { id: t.driver_rigger_employee_id as string, full_name: empMap.get(t.driver_rigger_employee_id as string) ?? "Driver/Rigger" }
        : null,
      dtTools: tools.filter((x) => x.ehs_wear_role === "dt"),
      driverTools: tools.filter((x) => x.ehs_wear_role === "driver_rigger"),
    });
  }

  blocks.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return blocks;
}
