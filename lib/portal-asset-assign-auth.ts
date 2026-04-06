import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches seed `roles` — Administrator. */
const ADMINISTRATOR_ROLE_ID = "a0000000-0000-0000-0000-000000000001";
/** Matches `fts-admin/lib/rbac/permissions.ts` SUPER_ROLE_ID. */
const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

/**
 * Admin-portal users (no `employees` row) who may assign assets from the employee portal
 * with global scope — same login as "Admin view" in the layout, plus role/permission gates.
 */
export async function resolvePortalAdminAssetAssigner(
  supabase: SupabaseClient,
  authUserId: string,
  email: string
): Promise<boolean> {
  const em = email.trim();
  const { data: profile } = await supabase
    .from("users_profile")
    .select("id, status, is_super_user")
    .eq("id", authUserId)
    .maybeSingle();
  if (!profile || profile.status !== "ACTIVE") return false;
  const { data: emp } = await supabase.from("employees").select("id").eq("email", em).maybeSingle();
  if (emp) return false;
  if (profile.is_super_user) return true;
  const { data: namedRoles } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", authUserId)
    .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID])
    .limit(2);
  if ((namedRoles ?? []).length > 0) return true;
  const { data: ur } = await supabase.from("user_roles").select("role_id").eq("user_id", authUserId);
  const roleIds = [...new Set((ur ?? []).map((r) => r.role_id as string))];
  if (roleIds.length === 0) return false;
  const { data: rp } = await supabase.from("role_permissions").select("permission_id").in("role_id", roleIds);
  const permIds = [...new Set((rp ?? []).map((p) => p.permission_id as string))];
  if (permIds.length === 0) return false;
  const { data: perms } = await supabase
    .from("permissions")
    .select("code")
    .in("id", permIds)
    .in("code", ["assets.assign", "assets.manage"]);
  return (perms ?? []).length > 0;
}
