import { NextRequest, NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyUsersWhoManageEmployees } from "@/lib/notify-employee-managers";

function norm(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length ? t : null;
}

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function employeeContext(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth?.user.email) return { error: "Unauthorized" as const };

  const email = auth.user.email.trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const client = admin ?? (await getDataClient());

  const { data: employee } = await client
    .from("employees")
    .select("id, status, full_name, phone, email")
    .eq("email", email)
    .maybeSingle();
  const { data: userProfile } = await client
    .from("users_profile")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;
  if (!isEmployee || isAdminView) {
    return { error: "Forbidden" as const };
  }

  return {
    error: null,
    session: auth.session,
    employee: employee!,
    dataClient: await getDataClient(),
  };
}

/** GET: this employee's recent profile update requests. */
export async function GET(req: Request) {
  const ctx = await employeeContext(req);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.error === "Forbidden" ? 403 : 401 });

  const { data: rows, error } = await ctx.dataClient
    .from("employee_profile_update_requests")
    .select(
      "id, status, requested_full_name, requested_phone, requested_email, note_from_employee, created_at, resolved_at"
    )
    .eq("employee_id", ctx.employee.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: rows ?? [] });
}

/** POST: submit a new request (at least one of name / phone / email with new values). */
export async function POST(request: NextRequest) {
  const ctx = await employeeContext(request);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.error === "Forbidden" ? 403 : 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requested_full_name = norm(body.requested_full_name);
  const requested_phone = norm(body.requested_phone);
  const requested_email = norm(body.requested_email)?.toLowerCase() ?? null;
  const note_from_employee = norm(body.note_from_employee);

  if (!requested_full_name && !requested_phone && !requested_email) {
    return NextResponse.json(
      { error: "Provide at least one new name, phone, or email to request a change." },
      { status: 400 }
    );
  }

  if (requested_email && !isPlausibleEmail(requested_email)) {
    return NextResponse.json({ error: "Invalid email format." }, { status: 400 });
  }

  const curName = (ctx.employee.full_name ?? "").trim();
  const curPhone = (ctx.employee.phone ?? "").trim();
  const curEmail = (ctx.employee.email ?? "").trim().toLowerCase();

  if (requested_full_name && requested_full_name === curName) {
    return NextResponse.json({ error: "Requested name matches your current name." }, { status: 400 });
  }
  if (requested_phone !== null && requested_phone === curPhone) {
    return NextResponse.json({ error: "Requested phone matches your current phone." }, { status: 400 });
  }
  if (requested_email && requested_email === curEmail) {
    return NextResponse.json({ error: "Requested email matches your current email." }, { status: 400 });
  }

  const { data: inserted, error } = await ctx.dataClient
    .from("employee_profile_update_requests")
    .insert({
      employee_id: ctx.employee.id,
      status: "pending",
      requested_full_name,
      requested_phone,
      requested_email,
      note_from_employee,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const link = `/employee-requests/profile-updates/${inserted.id}`;
  const parts: string[] = [];
  if (requested_full_name) parts.push("name");
  if (requested_phone) parts.push("phone");
  if (requested_email) parts.push("email");
  await notifyUsersWhoManageEmployees(ctx.dataClient, {
    title: "Profile update request",
    body: `${curName || ctx.session.user.email} requested an update (${parts.join(", ")}).`,
    link,
    meta: { employee_profile_update_request_id: inserted.id, employee_id: ctx.employee.id },
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
