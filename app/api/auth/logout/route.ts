import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { mergeCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export async function POST(request: NextRequest) {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createServerClient(
    env.url,
    env.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: { path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" } }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, mergeCookieOptions(request, options))
          );
        },
      },
    }
  );
  await supabase.auth.signOut();
  return response;
}
