import type { SupabaseClient } from "@supabase/supabase-js";

/** Comma-separated assigned roles from `employee_roles`, sorted for stable display. */
export async function getEmployeeRolesDisplay(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string> {
  const { data: rows } = await supabase.from("employee_roles").select("role").eq("employee_id", employeeId);
  const roles = [...new Set((rows ?? []).map((r) => String(r.role ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  return roles.join(", ");
}
