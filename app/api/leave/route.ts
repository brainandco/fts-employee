import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/leave — submit a leave request (creates an approval with type leave_request).
 * Employee must be logged in; region_id is taken from the employee's record.
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const from_date = typeof body.from_date === "string" ? body.from_date.trim() : "";
  const to_date = typeof body.to_date === "string" ? body.to_date.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!from_date || !to_date) {
    return NextResponse.json({ message: "From date and to date are required" }, { status: 400 });
  }

  const from = new Date(from_date);
  const to = new Date(to_date);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ message: "Invalid date format" }, { status: 400 });
  }
  if (to < from) {
    return NextResponse.json({ message: "To date must be on or after from date" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, full_name")
    .eq("email", session.user.email ?? "")
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ message: "Employee record not found" }, { status: 403 });
  }

  const { data: approval, error } = await supabase
    .from("approvals")
    .insert({
      approval_type: "leave_request",
      status: "Submitted",
      requester_id: session.user.id,
      region_id: employee.region_id ?? null,
      payload_json: {
        from_date,
        to_date,
        reason: reason || null,
        requester_employee_id: employee.id,
        requester_name: employee.full_name ?? null,
      },
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const { data: adminProfiles } = await supabase
    .from("users_profile")
    .select("id")
    .eq("status", "ACTIVE")
    .eq("is_super_user", false);
  const notifications = (adminProfiles ?? []).map((p) => ({
    recipient_user_id: p.id,
    title: "New leave request submitted",
    body: "A leave request needs admin review and remarks.",
    category: "leave_request",
    link: `/approvals/${approval.id}`,
    meta: { approval_id: approval.id, from_date, to_date },
  }));
  if (notifications.length > 0) {
    await supabase.from("notifications").insert(notifications);
  }

  return NextResponse.json({ id: approval.id, message: "Leave request submitted" });
}
