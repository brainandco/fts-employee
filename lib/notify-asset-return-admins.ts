import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";

type NotifyPayload = {
  title: string;
  body: string;
  link: string;
  meta?: Record<string, unknown>;
};

/** Notify admins who can process asset returns (`assets.manage` or `assets.return`). */
export async function notifyAssetReturnAdmins(client: SupabaseClient, payload: NotifyPayload): Promise<void> {
  const userIds = new Set<string>();
  const codes = ["assets.manage", "assets.return"] as const;

  for (const code of codes) {
    const { data: perm } = await client.from("permissions").select("id").eq("code", code).maybeSingle();
    if (!perm?.id) continue;
    const { data: rp } = await client.from("role_permissions").select("role_id").eq("permission_id", perm.id);
    const roleIds = [...new Set((rp ?? []).map((r) => r.role_id))];
    if (!roleIds.length) continue;
    const { data: ur } = await client.from("user_roles").select("user_id").in("role_id", roleIds);
    for (const r of ur ?? []) userIds.add(r.user_id);
  }

  const { data: superUsers } = await client
    .from("users_profile")
    .select("id")
    .eq("is_super_user", true)
    .eq("status", "ACTIVE");
  for (const u of superUsers ?? []) userIds.add(u.id);

  const rows = [...userIds].map((recipient_user_id) => ({
    recipient_user_id,
    title: payload.title,
    body: payload.body,
    category: "asset_return",
    link: payload.link,
    meta: (payload.meta ?? {}) as object,
  }));
  if (rows.length) await dispatchNotifications(client, rows);
}
