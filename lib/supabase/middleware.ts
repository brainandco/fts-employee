import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mergeCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  const env = getSupabaseUrlAndAnonKey();
  if (!env) {
    console.error(
      "[Supabase] Missing URL or public key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (Vercel Marketplace)."
    );
    return response;
  }
  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: { path?: string; maxAge?: number; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: "lax" | "strict" | "none" } }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, mergeCookieOptions(request, options))
          );
        },
      },
    }
  );
  await supabase.auth.getSession();
  return response;
}
