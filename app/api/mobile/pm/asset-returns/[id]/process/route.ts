import { NextResponse } from "next/server";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { employeeHasPmRole } from "@/lib/employees/pm-role";

type Decision = "Available" | "Under_Maintenance" | "Damaged";

/** POST — PM processes an asset return (Bearer). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ctx = await requirePmMobileContext(auth);
  if ("error" in ctx) return ctx.error;

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

  const { supabase, allowedRegionIds, authUserId } = ctx;

  const { data: row, error: fetchErr } = await supabase
    .from("asset_return_requests")
    .select("id, asset_id, from_employee_id, status, region_id")
    .eq("id", id)
    .single();

  if (fetchErr || !row) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ message: "Already processed" }, { status: 400 });
  if (await employeeHasPmRole(supabase, row.from_employee_id)) {
    return NextResponse.json(
      { message: "Returns from Project Managers are confirmed by Admin in the Admin Portal." },
      { status: 403 }
    );
  }
  if (!allowedRegionIds.includes(row.region_id as string)) {
    return NextResponse.json({ message: "Outside your PM scope" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const pm_comment_val = decision === "Available" ? (trimmed || null) : trimmed;

  const { error: u1 } = await supabase
    .from("asset_return_requests")
    .update({
      status: "processed",
      pm_decision: decision,
      pm_comment: pm_comment_val,
      processed_by_user_id: authUserId,
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

  return NextResponse.json({ ok: true, message: `Processed as ${decision.replace(/_/g, " ")}` });
}
