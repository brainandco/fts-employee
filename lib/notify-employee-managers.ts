import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches `fts-admin/lib/rbac/permissions.ts` SUPER_ROLE_ID. */
const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

type NotifyPayload = {
  title: string;
  body: string;
  link: string;
  meta?: Record<string, unknown>;
};

/**
 * Notify Super Users, Super role holders, and anyone with `employees.manage`.
 */
export async function notifyUsersWhoManageEmployees(client: SupabaseClient, payload: NotifyPayload): Promise<void> {
  const userIds = new Set<string>();

  const { data: perm } = await client.from("permissions").select("id").eq("code", "employees.manage").maybeSingle();
  if (perm?.id) {
    const { data: rp } = await client.from("role_permissions").select("role_id").eq("permission_id", perm.id);
    const roleIds = [...new Set((rp ?? []).map((r) => r.role_id))];
    if (roleIds.length) {
      const { data: ur } = await client.from("user_roles").select("user_id").in("role_id", roleIds);
      for (const r of ur ?? []) userIds.add(r.user_id);
    }
  }

  const { data: superUsers } = await client
    .from("users_profile")
    .select("id")
    .eq("is_super_user", true)
    .eq("status", "ACTIVE");
  for (const u of superUsers ?? []) userIds.add(u.id);

  const { data: superRoleUr } = await client.from("user_roles").select("user_id").eq("role_id", SUPER_ROLE_ID);
  for (const r of superRoleUr ?? []) userIds.add(r.user_id);

  const rows = [...userIds].map((recipient_user_id) => ({
    recipient_user_id,
    title: payload.title,
    body: payload.body,
    category: "employee_profile_update_request",
    link: payload.link,
    meta: (payload.meta ?? {}) as object,
  }));
  if (rows.length) await client.from("notifications").insert(rows);
}
