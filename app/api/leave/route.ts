import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { inclusiveCalendarDays } from "@/lib/employee-requests/leave-metrics";
import { getEmployeeRolesDisplay } from "@/lib/employee-roles-display";

async function regionAndProjectNames(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  regionId: string | null,
  projectId: string | null,
  projectNameOther: string | null | undefined
) {
  let region_name = "";
  let project_name = "";
  if (regionId) {
    const { data: r } = await supabase.from("regions").select("name").eq("id", regionId).maybeSingle();
    region_name = (r?.name ?? "").trim();
  }
  if (projectId) {
    const { data: p } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
    project_name = (p?.name ?? "").trim();
  }
  if (!project_name && projectNameOther) project_name = projectNameOther.trim();
  return { region_name, project_name };
}

/**
 * POST /api/leave — submit a leave request (creates an approval with type leave_request).
 * Requires guarantor in same region and leave type. Snapshots applicant & guarantor for PDF performa.
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const from_date = typeof body.from_date === "string" ? body.from_date.trim() : "";
  const to_date = typeof body.to_date === "string" ? body.to_date.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const guarantor_employee_id = typeof body.guarantor_employee_id === "string" ? body.guarantor_employee_id.trim() : "";
  const leave_type = typeof body.leave_type === "string" ? body.leave_type.trim() : "";

  if (!from_date || !to_date) {
    return NextResponse.json({ message: "From date and to date are required" }, { status: 400 });
  }
  if (!guarantor_employee_id) {
    return NextResponse.json({ message: "Guarantor is required (must be another employee in your region)." }, { status: 400 });
  }
  if (!leave_type) {
    return NextResponse.json({ message: "Leave type is required" }, { status: 400 });
  }
  if (!reason.trim()) {
    return NextResponse.json({ message: "Reason is required" }, { status: 400 });
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
  const email = (session.user.email ?? "").trim().toLowerCase();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, full_name, iqama_number, job_title, department, phone, email, project_id, project_name_other, status")
    .eq("email", email)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ message: "Employee record not found" }, { status: 403 });
  }
  if (employee.status !== "ACTIVE") {
    return NextResponse.json({ message: "Only active employees can request leave" }, { status: 403 });
  }
  if (!employee.region_id) {
    return NextResponse.json({ message: "Your employee record has no region; contact admin." }, { status: 400 });
  }

  const { data: guarantor } = await supabase
    .from("employees")
    .select("id, region_id, full_name, iqama_number, job_title, department, phone, email, project_id, project_name_other, status")
    .eq("id", guarantor_employee_id)
    .maybeSingle();

  if (!guarantor || guarantor.status !== "ACTIVE") {
    return NextResponse.json({ message: "Guarantor not found or inactive" }, { status: 400 });
  }
  if (guarantor.id === employee.id) {
    return NextResponse.json({ message: "You cannot select yourself as guarantor" }, { status: 400 });
  }
  if (guarantor.region_id !== employee.region_id) {
    return NextResponse.json({ message: "Guarantor must be in the same region as you" }, { status: 400 });
  }

  const reqRp = await regionAndProjectNames(supabase, employee.region_id, employee.project_id, employee.project_name_other);
  const guRp = await regionAndProjectNames(supabase, guarantor.region_id, guarantor.project_id, guarantor.project_name_other);

  const [requesterRoles, guarantorRoles] = await Promise.all([
    getEmployeeRolesDisplay(supabase, employee.id),
    getEmployeeRolesDisplay(supabase, guarantor.id),
  ]);
  /** Performa PDF: `fts_requestor_job_title` shows portal roles (same semantic as designation for guarantor). */
  const requester_job_title_for_performa =
    requesterRoles.trim() || (employee.job_title ?? employee.department ?? "").trim();
  /** Performa PDF: `fts_guarantor_designation` is filled from this snapshot (roles preferred). */
  const guarantor_designation_for_performa =
    guarantorRoles.trim() || (guarantor.job_title ?? guarantor.department ?? "").trim();

  const total_days = inclusiveCalendarDays(from_date, to_date);

  const payload_json = {
    from_date,
    to_date,
    reason,
    leave_type,
    requester_employee_id: employee.id,
    requester_name: employee.full_name ?? null,
    requester_display_name: (employee.full_name ?? "").trim(),
    requester_iqama: (employee.iqama_number ?? "").trim(),
    requester_job_title: requester_job_title_for_performa,
    requester_region_name: reqRp.region_name,
    requester_project_name: reqRp.project_name,
    guarantor_employee_id: guarantor.id,
    guarantor_display_name: (guarantor.full_name ?? "").trim(),
    guarantor_iqama: (guarantor.iqama_number ?? "").trim(),
    guarantor_phone: (guarantor.phone ?? "").trim(),
    guarantor_email: (guarantor.email ?? "").trim(),
    guarantor_job_title: guarantor_designation_for_performa,
    guarantor_region_name: guRp.region_name,
    guarantor_project_name: guRp.project_name,
    leave_total_days_snapshot: total_days,
  };

  const { data: approval, error } = await supabase
    .from("approvals")
    .insert({
      approval_type: "leave_request",
      status: "Submitted",
      requester_id: session.user.id,
      region_id: employee.region_id ?? null,
      payload_json,
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
