import type { SupabaseClient } from "@supabase/supabase-js";

const PM_ROLE = "Project Manager";

export async function employeeHasPmRole(
  supabase: SupabaseClient,
  employeeId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .eq("role", PM_ROLE)
    .maybeSingle();
  return !!data;
}

/** Employee IDs that hold the Project Manager role. */
export async function pmEmployeeIdSet(
  supabase: SupabaseClient,
  employeeIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(employeeIds.filter(Boolean))];
  if (!unique.length) return new Set();
  const { data } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .in("employee_id", unique)
    .eq("role", PM_ROLE);
  return new Set((data ?? []).map((r) => r.employee_id as string));
}
