import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: current_password,
  });
  if (signErr) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const { error: updErr } = await supabase.auth.updateUser({ password: new_password });
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
