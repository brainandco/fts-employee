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

/** PATCH: admin view only — update display name on users_profile. Employees use a change request instead. */
export async function PATCH(request: NextRequest) {
  const ctx = await getPortalContext();
  if (ctx.error || !ctx.session) {
    return NextResponse.json({ error: ctx.error ?? "Unauthorized" }, { status: 401 });
  }

  if (ctx.isEmployee && ctx.employeeId) {
    return NextResponse.json(
      {
        error:
          "Name, phone, and other profile details are updated by your administrator. Use Profile settings → Request a change to send them the new values.",
      },
      { status: 403 }
    );
  }

  if (!ctx.isAdminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { full_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const full_name =
    typeof body.full_name === "string" ? body.full_name.trim() || null : null;

  const client = ctx.dataClient;
  const { error } = await client
    .from("users_profile")
    .update({ full_name })
    .eq("id", ctx.session.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
