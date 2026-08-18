import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import { collectSuperUserRecipientUserIds } from "@/lib/notify-super-users";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

type NotifyPayload = {
  title: string;
  body: string;
  link: string;
  meta?: Record<string, unknown>;
};

function notifyClientOrFallback(fallback: SupabaseClient): SupabaseClient {
  try {
    return createServerSupabaseAdmin();
  } catch {
    return fallback;
  }
}

async function collectVehicleAdminUserIds(client: SupabaseClient): Promise<string[]> {
  const userIds = new Set<string>(await collectSuperUserRecipientUserIds(client));
  const codes = ["vehicles.manage", "vehicles.assign"] as const;

  for (const code of codes) {
    const { data: perm } = await client.from("permissions").select("id").eq("code", code).maybeSingle();
    if (!perm?.id) continue;
    const { data: rp } = await client.from("role_permissions").select("role_id").eq("permission_id", perm.id);
    const roleIds = [...new Set((rp ?? []).map((r) => r.role_id as string))];
    if (!roleIds.length) continue;
    const { data: ur } = await client.from("user_roles").select("user_id").in("role_id", roleIds);
    for (const r of ur ?? []) {
      if (r.user_id) userIds.add(r.user_id as string);
    }
  }

  if (userIds.size === 0) return [];
  const { data: profiles } = await client
    .from("users_profile")
    .select("id, status, employee_portal_only")
    .in("id", [...userIds]);

  return (profiles ?? [])
    .filter((u) => String(u.status ?? "") !== "DISABLED" && u.employee_portal_only !== true)
    .map((u) => u.id as string)
    .filter(Boolean);
}

export async function notifyVehicleDutyAdmins(client: SupabaseClient, payload: NotifyPayload): Promise<void> {
  const ids = await collectVehicleAdminUserIds(client);
  if (ids.length === 0) return;
  const rows = ids.map((recipient_user_id) => ({
    recipient_user_id,
    title: payload.title,
    body: payload.body,
    category: "vehicle_duty",
    link: payload.link,
    meta: (payload.meta ?? {}) as object,
  }));
  await dispatchNotifications(notifyClientOrFallback(client), rows);
}
