import type { SupabaseClient } from "@supabase/supabase-js";

/** Same gate as dashboard layout: active employee, or active admin profile without employee row. */
export async function canAccessSoftwareLibrary(supabase: SupabaseClient, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("status").eq("email", e).maybeSingle();
  if (employee) return employee.status === "ACTIVE";
  const { data: profile } = await supabase.from("users_profile").select("status").eq("email", e).maybeSingle();
  return profile?.status === "ACTIVE";
}
