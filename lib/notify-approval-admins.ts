import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { collectSuperUserRecipientUserIds } from "@/lib/notify-super-users";

/** Matches seed `roles` row for full admin portal access. */
const ADMINISTRATOR_ROLE_ID = "a0000000-0000-0000-0000-000000000001";

type NotifyPayload = {
  title: string;
  body: string;
  link: string;
  category: string;
  meta?: Record<string, unknown>;
};

function notifyClientOrFallback(fallback: SupabaseClient): SupabaseClient {
  try {
    return createServerSupabaseAdmin();
  } catch {
    return fallback;
  }
}

/**
 * Admin-portal users who can perform first-stage approval (not Super User).
 * Includes Administrator role holders and anyone with `approvals.approve`.
 */
export async function collectAdminNonSuperApproverUserIds(
  client: SupabaseClient,
  options?: { excludeUserId?: string | null; permissionCode?: string }
): Promise<string[]> {
  const permissionCode = options?.permissionCode ?? "approvals.approve";
  const superIds = new Set(await collectSuperUserRecipientUserIds(client));
  const candidateIds = new Set<string>();

  const { data: administratorRows } = await client
    .from("user_roles")
    .select("user_id")
    .eq("role_id", ADMINISTRATOR_ROLE_ID);
  for (const r of administratorRows ?? []) {
    if (r.user_id) candidateIds.add(r.user_id as string);
  }

  const { data: perm } = await client.from("permissions").select("id").eq("code", permissionCode).maybeSingle();
  if (perm?.id) {
    const { data: rp } = await client.from("role_permissions").select("role_id").eq("permission_id", perm.id);
    const roleIds = [...new Set((rp ?? []).map((r) => r.role_id as string))];
    if (roleIds.length > 0) {
      const { data: ur } = await client.from("user_roles").select("user_id").in("role_id", roleIds);
      for (const r of ur ?? []) {
        if (r.user_id) candidateIds.add(r.user_id as string);
      }
    }

    const { data: overrides } = await client
      .from("user_permission_overrides")
      .select("user_id, granted")
      .eq("permission_id", perm.id);
    for (const o of overrides ?? []) {
      const uid = o.user_id as string;
      if (o.granted) candidateIds.add(uid);
      else candidateIds.delete(uid);
    }
  }

  for (const uid of superIds) candidateIds.delete(uid);
  const ex = options?.excludeUserId?.trim();
  if (ex) candidateIds.delete(ex);

  if (candidateIds.size === 0) return [];

  const { data: profiles } = await client
    .from("users_profile")
    .select("id, status, employee_portal_only")
    .in("id", [...candidateIds]);

  return (profiles ?? [])
    .filter((u) => {
      const status = String(u.status ?? "");
      if (status === "DISABLED") return false;
      if (u.employee_portal_only === true) return false;
      return true;
    })
    .map((u) => u.id as string)
    .filter(Boolean);
}

/** Notify first-stage approval admins (non-super) for a new request. Uses service role for insert when available. */
export async function notifyApprovalAdmins(client: SupabaseClient, payload: NotifyPayload): Promise<number> {
  const userIds = await collectAdminNonSuperApproverUserIds(client);
  if (userIds.length === 0) return 0;

  const rows = userIds.map((recipient_user_id) => ({
    recipient_user_id,
    title: payload.title,
    body: payload.body,
    category: payload.category,
    link: payload.link,
    meta: (payload.meta ?? {}) as object,
  }));

  await dispatchNotifications(notifyClientOrFallback(client), rows);
  return rows.length;
}
