import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

/** Send Expo push to all registered devices for a user (best-effort, non-blocking errors). */
export async function sendExpoPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<void> {
  const { data: tokens } = await supabase
    .from("push_device_tokens")
    .select("expo_push_token")
    .eq("user_id", userId);

  const pushTokens = (tokens ?? []).map((t) => t.expo_push_token as string).filter(Boolean);
  if (pushTokens.length === 0) return;

  const messages = pushTokens.map((to) => ({
    to,
    sound: "default" as const,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    } catch {
      /* non-fatal */
    }
  }
}

export async function sendExpoPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map((uid) => sendExpoPushToUser(supabase, uid, payload)));
}
