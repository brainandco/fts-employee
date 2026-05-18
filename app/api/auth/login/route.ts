import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { mergeCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

function safeRedirectTo(raw: string, baseUrl: string): string {
  const s = (raw || "").trim() || "/dashboard";
  if (!s.startsWith("/") || s.startsWith("//")) return "/dashboard";
  try {
    const u = new URL(s, baseUrl);
    if (u.origin !== new URL(baseUrl).origin) return "/dashboard";
    return u.pathname + u.search;
  } catch {
    return "/dashboard";
  }
}

/**
 * Employee portal login. Only allows sign-in if the email exists in employees
 * table with status ACTIVE (created by Super User in admin).
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";
  const redirectTo = safeRedirectTo((formData.get("redirectTo") as string) || "/dashboard", request.url);
  const wantsJson = request.headers.get("accept")?.includes("application/json");

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", redirectTo);

  if (!email?.trim() || !password) {
    if (wantsJson) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    loginUrl.searchParams.set("error", encodeURIComponent("Email and password required"));
    return NextResponse.redirect(loginUrl, 302);
  }

  const redirectResponse = NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
  const jsonResponse = NextResponse.json({ ok: true, redirectTo });
  const responseToUse = wantsJson ? jsonResponse : redirectResponse;

  const env = getSupabaseUrlAndAnonKey();
  if (!env) {
    if (wantsJson) return NextResponse.json({ error: "Server configuration" }, { status: 500 });
    loginUrl.searchParams.set("error", encodeURIComponent("Server configuration"));
    return NextResponse.redirect(loginUrl, 302);
  }

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
            responseToUse.cookies.set(name, value, mergeCookieOptions(request, options))
          );
        },
      },
    }
  );

  const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (authError) {
    if (wantsJson) return NextResponse.json({ error: authError.message }, { status: 401 });
    loginUrl.searchParams.set("error", encodeURIComponent(authError.message));
    return NextResponse.redirect(loginUrl, 302);
  }

  const { resolveEmployeePortalAccess } = await import("@/lib/auth/portal-access");
  const {
    data: { session: newSession },
  } = await supabase.auth.getSession();
  const access = await resolveEmployeePortalAccess(newSession);

  if (access.kind === "denied") {
    await supabase.auth.signOut();
    if (access.reason === "misconfigured") {
      if (wantsJson) return NextResponse.json({ error: access.message }, { status: 503 });
      return NextResponse.redirect(new URL("/portal-unavailable", request.url), 302);
    }
    if (wantsJson) return NextResponse.json({ error: access.message }, { status: 403 });
    loginUrl.searchParams.set("error", encodeURIComponent(access.message));
    return NextResponse.redirect(loginUrl, 302);
  }

  await supabase.auth.getSession();
  return responseToUse;
}
