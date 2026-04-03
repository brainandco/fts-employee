import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export function createClient() {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) {
    throw new Error(
      "Missing Supabase env: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
