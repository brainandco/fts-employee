import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { loadEmployeeWorkInfo } from "@/lib/mobile/employee-work-info";
import { isPendingLeaveStatus, mapLeaveApprovalRow } from "@/lib/mobile/leave-requests";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — employee dashboard stats for mobile (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind === "denied") {
    return NextResponse.json({ message: access.message }, { status: 403 });
  }

  if (access.kind === "admin_view") {
    return NextResponse.json({
      mode: "admin_view" as const,
      fullName: access.fullName,
      pendingReceiptCount: 0,
      assignedAssetCount: 0,
      assignedSimCount: 0,
      assignedVehicleCount: 0,
      openTaskCount: 0,
      unreadNotifications: 0,
      pmRegionEmployeeCount: null,
      pmRegionAssignedAssetCount: null,
    });
  }

  const supabase = await getDataClient();
  const employeeId = access.employeeId;

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employeeId);
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");

  const [
    pendingReceiptRes,
    assetsRes,
    simsRes,
    assignmentsRes,
    tasksRes,
    taskPreviewRes,
    notifRes,
    { data: employee },
  ] = await Promise.all([
    supabase
      .from("resource_receipt_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "pending"),
    supabase.from("assets").select("id").eq("assigned_to_employee_id", employeeId),
    supabase.from("sim_cards").select("id").eq("assigned_to_employee_id", employeeId),
    supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", employeeId),
    supabase
      .from("tasks")
      .select("id, status")
      .eq("assigned_to_user_id", auth.user.id),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, created_at")
      .eq("assigned_to_user_id", auth.user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", auth.user.id)
      .eq("is_read", false),
    supabase.from("employees").select("id, region_id, project_id").eq("id", employeeId).maybeSingle(),
  ]);

  let pmRegionEmployeeCount: number | null = null;
  let pmRegionAssignedAssetCount: number | null = null;

  if (isPm && employee) {
    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      auth.user.id
    );
    if (allowedRegionIds.length > 0) {
      const { count: empCount } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .in("region_id", allowedRegionIds)
        .eq("status", "ACTIVE");
      pmRegionEmployeeCount = empCount ?? 0;

      const { data: regionEmps } = await supabase
        .from("employees")
        .select("id")
        .in("region_id", allowedRegionIds)
        .eq("status", "ACTIVE");
      const regionEmpIds = (regionEmps ?? []).map((e) => e.id as string);
      if (regionEmpIds.length > 0) {
        const { count: assetCount } = await supabase
          .from("assets")
          .select("id", { count: "exact", head: true })
          .in("assigned_to_employee_id", regionEmpIds)
          .in("status", ["Assigned", "With_QC", "Under_Maintenance", "Damaged"]);
        pmRegionAssignedAssetCount = assetCount ?? 0;
      }
    }
  }

  const openTaskCount = (tasksRes.data ?? []).filter(
    (t) => t.status !== "Completed" && t.status !== "Closed"
  ).length;

  const recentTasks = (taskPreviewRes.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.due_date,
    createdAt: t.created_at,
    isOpen: t.status !== "Completed" && t.status !== "Closed",
  }));

  const work = await loadEmployeeWorkInfo(supabase, employeeId);

  const { data: leaveRows } = await supabase
    .from("approvals")
    .select("id, status, created_at, payload_json, admin_comment, pm_comment")
    .eq("requester_id", auth.user.id)
    .eq("approval_type", "leave_request")
    .order("created_at", { ascending: false })
    .limit(20);

  const leaveRequests = (leaveRows ?? []).map(mapLeaveApprovalRow);
  const pendingLeaveCount = leaveRequests.filter((l) => isPendingLeaveStatus(l.status)).length;
  const recentLeaves = leaveRequests.slice(0, 5);

  return NextResponse.json({
    mode: "employee" as const,
    fullName: access.fullName,
    isPm,
    pendingReceiptCount: pendingReceiptRes.count ?? 0,
    assignedAssetCount: (assetsRes.data ?? []).length,
    assignedSimCount: (simsRes.data ?? []).length,
    assignedVehicleCount: (assignmentsRes.data ?? []).length,
    openTaskCount,
    recentTasks,
    unreadNotifications: notifRes.count ?? 0,
    pmRegionEmployeeCount,
    pmRegionAssignedAssetCount,
    work,
    pendingLeaveCount,
    recentLeaves,
  });
}
