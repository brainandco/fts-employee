import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 401 | 500 };

/**
 * Verify current password and set a new one. Works for web (cookie identity) and mobile (Bearer identity).
 * Prefer service-role admin.updateUserById after signInWithPassword — avoids "Auth session missing!" on server clients.
 */
export async function changePasswordForUser(
  userId: string,
  email: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) return { ok: false, error: "Server misconfigured", status: 500 };

  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  });
  if (signErr) {
    return { ok: false, error: "Current password is incorrect.", status: 400 };
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createServerSupabaseAdmin();
    const { error: adminUpdErr } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (adminUpdErr) {
      return { ok: false, error: adminUpdErr.message, status: 400 };
    }
  } else if (signData.session) {
    const { error: setErr } = await supabase.auth.setSession({
      access_token: signData.session.access_token,
      refresh_token: signData.session.refresh_token,
    });
    if (setErr) {
      return { ok: false, error: setErr.message, status: 400 };
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) {
      return { ok: false, error: updErr.message, status: 400 };
    }
  } else {
    return { ok: false, error: "Could not establish auth session for password update.", status: 400 };
  }

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createServerSupabaseAdmin();
      await admin.from("users_profile").update({ must_change_password: false }).eq("id", userId);
      await admin.from("employees").update({ must_change_password: false }).eq("email", email.trim().toLowerCase());
    }
  } catch {
    /* non-fatal */
  }

  return { ok: true };
}
