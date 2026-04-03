/**
 * Resolves Supabase URL + public API key for middleware, SSR, and browser.
 * Vercel Marketplace sync supplies NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (not ANON_KEY).
 * @see https://supabase.com/docs/guides/integrations/vercel-marketplace
 */
export function getSupabaseUrlAndAnonKey(): { url: string; anonKey: string } | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Project URL only (e.g. admin client with service role). */
export function getSupabaseProjectUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  return url || null;
}
