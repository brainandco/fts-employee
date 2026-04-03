import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

async function getPortalContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.email) return { error: "Unauthorized" as const, supabase, session: null };

  const email = session.user.email.trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const client = admin ?? supabase;

  const { data: employee } = await client
    .from("employees")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  const { data: userProfile } = await client
    .from("users_profile")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;

  if (!isEmployee && !isAdminView) {
    return { error: "Forbidden" as const, supabase, session: null };
  }

  return {
    error: null,
    supabase,
    session,
    email,
    employeeId: employee?.id ?? null,
    isEmployee,
    isAdminView,
    dataClient: await getDataClient(),
  };
}

/** PATCH: update display name and (for employees) phone and accommodations. */
export async function PATCH(request: NextRequest) {
  const ctx = await getPortalContext();
  if (ctx.error || !ctx.session) {
    return NextResponse.json({ error: ctx.error ?? "Unauthorized" }, { status: 401 });
  }

  let body: { full_name?: unknown; phone?: unknown; accommodations?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const full_name =
    typeof body.full_name === "string" ? body.full_name.trim() || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  const accommodations =
    typeof body.accommodations === "string" ? body.accommodations.trim() || null : null;

  const client = ctx.dataClient;

  if (ctx.isAdminView) {
    const { error } = await client
      .from("users_profile")
      .update({ full_name })
      .eq("id", ctx.session.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (ctx.isEmployee && ctx.employeeId) {
    const { error } = await client
      .from("employees")
      .update({ full_name: full_name ?? "", phone: phone ?? "", accommodations: accommodations ?? "" })
      .eq("id", ctx.employeeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
