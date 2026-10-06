import type { SupabaseClient } from "@supabase/supabase-js";
import { getEhsToolType } from "@/lib/assets/ehs-tool-catalog";
import { DRIVER_RIGGER_ROLE } from "@/lib/auth/driver-iqama";

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

export type DriverEhsBlock = {
  employeeId: string;
  full_name: string;
  regionLabel: string;
  tools: EhsToolLine[];
};

/**
 * EHS tools grouped by the Driver/Rigger (or Self DT) who holds custody
 * via `assigned_to_employee_id` — no team join required.
 */
export async function loadDriverEhsAssignments(
  supabase: SupabaseClient,
  options?: { regionId?: string | null; regionIds?: string[] }
): Promise<DriverEhsBlock[]> {
  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id, role")
    .in("role", [DRIVER_RIGGER_ROLE, "Self DT"]);

  const driverIds = [...new Set((roleRows ?? []).map((r) => r.employee_id as string))];
  if (driverIds.length === 0) return [];

  let empQuery = supabase
    .from("employees")
    .select("id, full_name, email, region_id, status")
    .in("id", driverIds)
    .eq("status", "ACTIVE");

  if (options?.regionIds?.length) {
    empQuery = empQuery.in("region_id", options.regionIds);
  } else if (options?.regionId) {
    empQuery = empQuery.eq("region_id", options.regionId);
  }

  const { data: emps } = await empQuery;
  const activeIds = (emps ?? []).map((e) => e.id as string);
  if (activeIds.length === 0) return [];

  const { data: ehsAssets, error: ehsError } = await supabase
    .from("assets")
    .select(
      "id, asset_id, name, ehs_tool_type, ehs_wear_role, en_code, status, assigned_to_employee_id, ehs_for_employee_id"
    )
    .eq("is_ehs_tool", true)
    .in("assigned_to_employee_id", activeIds)
    .in("status", ["Assigned", "Under_Maintenance", "Damaged", "With_QC", "Pending_Return"]);

  if (ehsError) {
    console.error("[loadDriverEhsAssignments]", ehsError.message);
  }

  const byEmp = new Map<string, EhsToolLine[]>();
  for (const a of ehsAssets ?? []) {
    const eid = a.assigned_to_employee_id as string;
    const list = byEmp.get(eid) ?? [];
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
    byEmp.set(eid, list);
  }

  const regionIds = [...new Set((emps ?? []).map((e) => e.region_id).filter(Boolean) as string[])];
  const { data: regions } = regionIds.length
    ? await supabase.from("regions").select("id, name, code").in("id", regionIds)
    : { data: [] };
  const regionMap = new Map((regions ?? []).map((r) => [r.id, `${r.name}${r.code ? ` · ${r.code}` : ""}`]));

  const blocks: DriverEhsBlock[] = [];
  for (const e of emps ?? []) {
    const tools = byEmp.get(e.id as string) ?? [];
    if (tools.length === 0) continue;
    blocks.push({
      employeeId: e.id as string,
      full_name: ((e.full_name as string | null) ?? (e.email as string | null) ?? "Driver/Rigger").trim(),
      regionLabel: e.region_id ? (regionMap.get(e.region_id as string) ?? "—") : "No region",
      tools,
    });
  }

  blocks.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return blocks;
}
