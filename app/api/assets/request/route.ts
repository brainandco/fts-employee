import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** PM requests new assets from admin. */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const asset_name = typeof body.asset_name === "string" ? body.asset_name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const quantity = Number(body.quantity ?? 1);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const priority = typeof body.priority === "string" ? body.priority.trim() : "Normal";

  if (!asset_name || !category || !reason) {
    return NextResponse.json({ message: "asset_name, category, and reason are required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    return NextResponse.json({ message: "quantity must be an integer between 1 and 500" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", session.user.email ?? "")
    .maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee record not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can request assets" }, { status: 403 });

  const payload_json = {
    asset_name,
    category,
    quantity,
    reason,
    priority: ["Low", "Normal", "High", "Urgent"].includes(priority) ? priority : "Normal",
  };

  const { data, error } = await supabase
    .from("approvals")
    .insert({
      approval_type: "asset_request",
      status: "Submitted",
      requester_id: session.user.id,
      region_id: employee.region_id ?? null,
      payload_json,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const { data: adminProfiles } = await supabase
    .from("users_profile")
    .select("id")
    .eq("status", "ACTIVE")
    .eq("is_super_user", false);
  const notifications = (adminProfiles ?? []).map((p) => ({
    recipient_user_id: p.id,
    title: "New PM asset request",
    body: `${asset_name} (${quantity}) requested by PM for admin review.`,
    category: "asset_request",
    link: `/approvals/${data.id}`,
    meta: { approval_id: data.id, priority: payload_json.priority, category },
  }));
  if (notifications.length > 0) {
    await supabase.from("notifications").insert(notifications);
  }

  return NextResponse.json({ id: data.id, message: "Asset request submitted to Admin." });
}
