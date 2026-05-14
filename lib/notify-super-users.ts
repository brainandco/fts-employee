import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches `fts-admin/lib/rbac/permissions.ts` SUPER_ROLE_ID. */
const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

/**
 * Active super users (`users_profile.is_super_user` or Super role), de-duplicated.
 * Use for admin-queue alerts that must not go to every non-super profile (including portal employees).
 */
export async function collectSuperUserRecipientUserIds(
  client: SupabaseClient,
  options?: { excludeUserId?: string | null }
): Promise<string[]> {
  const ids = new Set<string>();
  const { data: profs } = await client
    .from("users_profile")
    .select("id")
    .eq("status", "ACTIVE")
    .eq("is_super_user", true);
  for (const p of profs ?? []) {
    if (p.id) ids.add(p.id);
  }
  const { data: roleRows } = await client.from("user_roles").select("user_id").eq("role_id", SUPER_ROLE_ID);
  for (const r of roleRows ?? []) {
    if (r.user_id) ids.add(r.user_id);
  }
  const ex = options?.excludeUserId?.trim();
  if (ex) ids.delete(ex);
  return [...ids];
}
