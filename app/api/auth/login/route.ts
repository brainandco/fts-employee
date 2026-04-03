import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { mergeCookieOptions } from "@/lib/supabase/cookie-options";

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Allow: (1) active employee, or (2) admin user (users_profile ACTIVE) for rare admin access to employee portal.
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? (await import("@/lib/supabase/admin")).createServerSupabaseAdmin()
    : null;
  const client = admin ?? supabase;
  const e = email.trim().toLowerCase();
  const { data: employee } = await client.from("employees").select("id, status").eq("email", e).maybeSingle();
  const { data: userProfile } = await client.from("users_profile").select("id, status").eq("email", e).maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdmin = !!userProfile && userProfile.status === "ACTIVE" && !employee;

  if (!isEmployee && !isAdmin) {
    await supabase.auth.signOut();
    const msg = employee
      ? "Employee account is not active. Contact your administrator."
      : "No employee or admin account for this email. Use Admin Portal for users, Employee Portal for employees.";
    if (wantsJson) return NextResponse.json({ error: msg }, { status: 403 });
    loginUrl.searchParams.set("error", encodeURIComponent(msg));
    return NextResponse.redirect(loginUrl, 302);
  }

  await supabase.auth.getSession();
  return responseToUse;
}
