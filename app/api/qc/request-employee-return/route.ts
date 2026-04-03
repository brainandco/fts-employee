import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * QC asks an employee in the same region to return all assigned assets, vehicle, and SIMs before leaving the team.
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const target_employee_id = typeof body.target_employee_id === "string" ? body.target_employee_id.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!target_employee_id) return NextResponse.json({ message: "target_employee_id is required" }, { status: 400 });
  if (!message) return NextResponse.json({ message: "message is required" }, { status: 400 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: qcEmp } = await supabase.from("employees").select("id, region_id, full_name").eq("email", email).maybeSingle();
  if (!qcEmp) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: qcRole } = await supabase.from("employee_roles").select("role").eq("employee_id", qcEmp.id).eq("role", "QC").maybeSingle();
  if (!qcRole) return NextResponse.json({ message: "Only QC can send this request" }, { status: 403 });

  const { data: target } = await supabase
    .from("employees")
    .select("id, region_id, email, full_name")
    .eq("id", target_employee_id)
    .single();

  if (!target) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });
  if (target.region_id !== qcEmp.region_id) {
    return NextResponse.json({ message: "You can only request returns from employees in your region" }, { status: 403 });
  }
  if (target.id === qcEmp.id) {
    return NextResponse.json({ message: "Choose another employee" }, { status: 400 });
  }

  if (!target.email) {
    return NextResponse.json({ message: "Target employee has no email on file for notifications" }, { status: 400 });
  }

  const { data: recipient } = await supabase.from("users_profile").select("id").eq("email", target.email).maybeSingle();
  if (!recipient?.id) {
    return NextResponse.json({ message: "Target user has no portal login" }, { status: 400 });
  }

  await supabase.from("notifications").insert({
    recipient_user_id: recipient.id,
    title: "QC: please return assigned items",
    body: `${qcEmp.full_name ?? "QC"} requests that you return all assigned assets, vehicle, and SIMs via the Employee Portal before leaving or changing team. ${message}`,
    category: "qc_return_request",
    link: "/dashboard",
    meta: { qc_employee_id: qcEmp.id, target_employee_id: target.id },
  });

  return NextResponse.json({ ok: true });
}
