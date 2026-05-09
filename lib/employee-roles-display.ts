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

/** Portal `user_roles` + Super flag, sorted for performa / labels. */
export async function getPortalRolesDisplay(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await supabase.from("users_profile").select("is_super_user").eq("id", userId).maybeSingle();
  const { data: rows } = await supabase.from("user_roles").select("roles(name)").eq("user_id", userId);
  const names = new Set<string>();
  if (profile?.is_super_user) names.add("Super User");
  for (const r of rows ?? []) {
    const row = r as { roles?: { name?: string } | null };
    const n = row.roles?.name;
    if (n) names.add(String(n).trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b)).join(", ");
}
