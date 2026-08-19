import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPushToUser } from "@/lib/push/expo-push";

export type NotificationInsertRow = {
  recipient_user_id: string;
  title: string;
  body: string;
  category: string;
  link?: string | null;
  meta?: Record<string, unknown> | object;
};

/** Insert in-app notifications and send matching Expo push messages. */
export async function dispatchNotifications(
  supabase: SupabaseClient,
  rows: NotificationInsertRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("notifications").insert(
    rows.map((r) => ({
      recipient_user_id: r.recipient_user_id,
      title: r.title,
      body: r.body,
      category: r.category,
      link: r.link ?? null,
      meta: (r.meta ?? {}) as object,
    }))
  );
  if (error) throw error;

  await Promise.all(
    rows.map((r) =>
      sendExpoPushToUser(supabase, r.recipient_user_id, {
        title: r.title,
        body: r.body,
        data: {
          category: r.category,
          ...(r.link ? { link: r.link } : {}),
          ...(typeof (r.meta as Record<string, unknown> | undefined)?.approval_id === "string"
            ? { approval_id: (r.meta as Record<string, string>).approval_id }
            : {}),
          ...(typeof (r.meta as Record<string, unknown> | undefined)?.employee_profile_update_request_id ===
          "string"
            ? {
                employee_profile_update_request_id: (r.meta as Record<string, string>)
                  .employee_profile_update_request_id,
              }
            : {}),
        },
      })
    )
  );
}
