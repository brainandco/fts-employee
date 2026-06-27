import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export async function POST(request: NextRequest) {
  const auth = await getRequestAuth(request);
  if (!auth?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = auth.session;

  let body: { current_password?: unknown; new_password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current_password =
    typeof body.current_password === "string" ? body.current_password : "";
  const new_password = typeof body.new_password === "string" ? body.new_password : "";

  if (current_password.length < 1 || new_password.length < 8) {
    return NextResponse.json(
      { error: "Current password required; new password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const env = getSupabaseUrlAndAnonKey();
  if (!env) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: current_password,
  });
  if (signErr) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const authed = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: updErr } = await authed.auth.updateUser({ password: new_password });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 400 });
  }

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createServerSupabaseAdmin();
      await admin.from("users_profile").update({ must_change_password: false }).eq("id", session.user.id);
      const em = session.user.email?.trim().toLowerCase();
      if (em) {
        await admin.from("employees").update({ must_change_password: false }).eq("email", em);
      }
    }
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ ok: true });
}
