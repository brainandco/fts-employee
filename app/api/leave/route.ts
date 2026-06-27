import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";
import { inclusiveCalendarDays } from "@/lib/employee-requests/leave-metrics";
import { getEmployeeRolesDisplay, getPortalRolesDisplay } from "@/lib/employee-roles-display";
import {
  assertAssignedAssetsReturnedIfRequired,
  LEAVE_ASSIGNED_ITEMS_NOT_RETURNED,
} from "@/lib/leave/leave-asset-prerequisite";
import { isAdministratorPortalUser } from "@/lib/leave/portal-admin-leave";
import { collectSuperUserRecipientUserIds } from "@/lib/notify-super-users";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";

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
 * No guarantor. Portal Administrator/Super User (auth) uses Super-only admin leave payload.
 * Other employees: assigned assets/SIMs must be returned before leave unless it is a single-day Sick or Casual request.
 */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const session = auth.session;

  const body = await req.json().catch(() => ({}));
  const from_date = typeof body.from_date === "string" ? body.from_date.trim() : "";
  const to_date = typeof body.to_date === "string" ? body.to_date.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const leave_type = typeof body.leave_type === "string" ? body.leave_type.trim() : "";

  if (!from_date || !to_date) {
    return NextResponse.json({ message: "From date and to date are required" }, { status: 400 });
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

  const adminPortalUser = await isAdministratorPortalUser(supabase, session.user.id);
  if (!adminPortalUser && !employee.region_id) {
    return NextResponse.json({ message: "Your employee record has no region; contact admin." }, { status: 400 });
  }

  if (!adminPortalUser) {
    const assetOk = await assertAssignedAssetsReturnedIfRequired(supabase, employee.id, leave_type, from_date, to_date);
    if (!assetOk.ok) {
      if ("code" in assetOk && assetOk.code === LEAVE_ASSIGNED_ITEMS_NOT_RETURNED) {
        return NextResponse.json(
          {
            code: assetOk.code,
            message: assetOk.message,
            asset_count: assetOk.assetCount,
            sim_count: assetOk.simCount,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ message: assetOk.message }, { status: 400 });
    }
  }

  const reqRp = await regionAndProjectNames(supabase, employee.region_id, employee.project_id, employee.project_name_other);
  const requesterRoles = await getEmployeeRolesDisplay(supabase, employee.id);
  const requester_job_title_for_performa =
    requesterRoles.trim() || (employee.job_title ?? employee.department ?? "").trim();

  const total_days = inclusiveCalendarDays(from_date, to_date);
  let payload_json: Record<string, unknown>;
  let notifySupersOnly = false;

  if (adminPortalUser) {
    notifySupersOnly = true;
    const portalRoleLine = (await getPortalRolesDisplay(supabase, session.user.id)).trim();
    const requester_title_admin =
      [requesterRoles.trim(), portalRoleLine].filter(Boolean).join(" · ") || requester_job_title_for_performa;
    payload_json = {
      admin_leave_request: true,
      from_date,
      to_date,
      reason,
      leave_type,
      requester_employee_id: employee.id,
      requester_name: employee.full_name ?? null,
      requester_display_name: (employee.full_name ?? "").trim(),
      requester_iqama: (employee.iqama_number ?? "").trim(),
      requester_job_title: requester_title_admin,
      requester_region_name: reqRp.region_name,
      requester_project_name: reqRp.project_name,
      guarantor_employee_id: null,
      guarantor_user_id: null,
      guarantor_display_name: "",
      guarantor_iqama: "",
      guarantor_phone: "",
      guarantor_email: "",
      guarantor_job_title: "",
      guarantor_region_name: "",
      guarantor_project_name: "",
      leave_total_days_snapshot: total_days,
    };
  } else {
    payload_json = {
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
      guarantor_employee_id: null,
      guarantor_user_id: null,
      guarantor_display_name: "",
      guarantor_iqama: "",
      guarantor_phone: "",
      guarantor_email: "",
      guarantor_job_title: "",
      guarantor_region_name: "",
      guarantor_project_name: "",
      leave_total_days_snapshot: total_days,
    };
  }

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

  const displayName = (employee.full_name ?? "").trim() || email;

  const rows: {
    recipient_user_id: string;
    title: string;
    body: string;
    category: string;
    link: string;
    meta: Record<string, unknown>;
  }[] = [];

  rows.push({
    recipient_user_id: session.user.id,
    title: "Leave request submitted",
    body: "Your leave request was submitted and is pending review. You will be notified when it is updated.",
    category: "leave_request",
    link: "/leave",
    meta: { approval_id: approval.id, from_date, to_date, self_submitted: true },
  });

  if (notifySupersOnly) {
    const superIds = await collectSuperUserRecipientUserIds(supabase, { excludeUserId: session.user.id });
    for (const sid of superIds) {
      rows.push({
        recipient_user_id: sid,
        title: "Leave request pending (Super User)",
        body: `${displayName} submitted a leave request (administrator — Super User approval required).`,
        category: "leave_request",
        link: `/approvals/${approval.id}`,
        meta: { approval_id: approval.id, from_date, to_date, admin_leave: true },
      });
    }
  } else {
    const superIds = await collectSuperUserRecipientUserIds(supabase, { excludeUserId: session.user.id });
    for (const sid of superIds) {
      rows.push({
        recipient_user_id: sid,
        title: "New leave request submitted",
        body: `${displayName} submitted a leave request that needs admin review in the Admin Portal.`,
        category: "leave_request",
        link: `/approvals/${approval.id}`,
        meta: { approval_id: approval.id, from_date, to_date },
      });
    }
  }

  if (rows.length > 0) {
    await dispatchNotifications(supabase, rows);
  }

  return NextResponse.json({ id: approval.id, message: "Leave request submitted" });
}
