import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export type RequestAuth = {
  supabase: SupabaseClient;
  user: User;
  session: Session;
};

function bearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m?.[1]?.trim() || null;
}

/** Cookie session (web) or Bearer JWT (mobile app). */
export async function getRequestAuth(req: Request): Promise<RequestAuth | null> {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) return null;

  const token = bearerToken(req);
  if (token) {
    const supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const session = { user: data.user, access_token: token } as Session;
    const authed = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { supabase: authed, user: data.user, session };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return { supabase, user: session.user, session };
}
