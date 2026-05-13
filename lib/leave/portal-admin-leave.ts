import type { SupabaseClient } from "@supabase/supabase-js";

/** Seed role UUID — `roles.name = 'Administrator'`. */
export const ADMINISTRATOR_ROLE_ID = "a0000000-0000-0000-0000-000000000001";
/** Seed role UUID — `roles.name = 'Super User'`. */
export const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

/** Portal Administrator / Super User (auth user): employee leave uses Super-only workflow (`admin_leave_request` in payload). */
export async function isAdministratorPortalUser(supabase: SupabaseClient, authUserId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("users_profile")
    .select("is_super_user, status")
    .eq("id", authUserId)
    .maybeSingle();
  if (!profile || profile.status !== "ACTIVE") return false;
  if (profile.is_super_user) return true;
  const { data: rows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", authUserId)
    .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID]);
  return !!rows?.length;
}
