import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

/** Resolve portal user IDs to display names (profile, then auth email, then employee name). */
export async function resolveAssignerNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const { data: profiles } = await supabase
    .from("users_profile")
    .select("id, full_name, email")
    .in("id", userIds);
  for (const u of profiles ?? []) {
    map.set(u.id as string, (u.full_name ?? u.email ?? "").trim() || "—");
  }

  const missing = userIds.filter((id) => !map.has(id));
  if (missing.length === 0) return map;

  let adminClient: ReturnType<typeof createServerSupabaseAdmin> | null = null;
  try {
    adminClient = createServerSupabaseAdmin();
  } catch {
    return map;
  }

  const emails = new Map<string, string>();
  await Promise.all(
    missing.map(async (uid) => {
      const { data, error } = await adminClient!.auth.admin.getUserById(uid);
      if (!error && data.user?.email) emails.set(uid, data.user.email.trim().toLowerCase());
    })
  );

  const emailList = [...new Set(emails.values())];
  if (emailList.length > 0) {
    const { data: emps } = await supabase.from("employees").select("email, full_name").in("email", emailList);
    const empByEmail = new Map((emps ?? []).map((e) => [(e.email as string).trim().toLowerCase(), e.full_name as string]));
    for (const uid of missing) {
      const em = emails.get(uid);
      if (em && empByEmail.has(em)) map.set(uid, empByEmail.get(em)!);
      else if (em) map.set(uid, em);
      else map.set(uid, "Unknown user");
    }
  } else {
    for (const uid of missing) map.set(uid, "Unknown user");
  }

  return map;
}
