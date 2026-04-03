import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Decision = "Available" | "Under_Maintenance" | "Damaged";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as Decision | undefined;
  const pm_comment = typeof body.pm_comment === "string" ? body.pm_comment : null;

  const allowed: Decision[] = ["Available", "Under_Maintenance", "Damaged"];
  if (!decision || !allowed.includes(decision)) {
    return NextResponse.json(
      { message: "decision must be Available, Under_Maintenance, or Damaged" },
      { status: 400 }
    );
  }
  const trimmed = pm_comment?.trim() ?? "";
  if (decision !== "Available" && !trimmed) {
    return NextResponse.json({ message: "PM comment is required for Under Maintenance or Damaged" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!employee?.region_id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data: row, error: fetchErr } = await supabase
    .from("asset_return_requests")
    .select("id, asset_id, status, region_id")
    .eq("id", id)
    .single();

  if (fetchErr || !row) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ message: "Already processed" }, { status: 400 });
  if (row.region_id !== employee.region_id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const pm_comment_val = decision === "Available" ? (trimmed || null) : trimmed;

  const { error: u1 } = await supabase
    .from("asset_return_requests")
    .update({
      status: "processed",
      pm_decision: decision,
      pm_comment: pm_comment_val,
      processed_by_user_id: session.user.id,
      processed_at: now,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (u1) return NextResponse.json({ message: u1.message }, { status: 400 });

  const { error: u2 } = await supabase
    .from("assets")
    .update({
      status: decision,
      assigned_to_employee_id: null,
      assigned_by: null,
      assigned_at: null,
    })
    .eq("id", row.asset_id);

  if (u2) return NextResponse.json({ message: u2.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
