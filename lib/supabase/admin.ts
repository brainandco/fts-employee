import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client with service_role key.
 * Used in login route to check employee exists and is ACTIVE (bypasses RLS).
 * Never expose this client or the service role key to the browser.
 */
export function createServerSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for admin client");
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
