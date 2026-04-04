import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { targetEmployeeIsOnPmTeam } from "@/lib/pm-team-assignees";
import { upsertPendingReceipts } from "@/lib/resource-receipts";

/**
 * POST /api/assets/assign-pm — PM assigns available assets to a DT or Driver/Rigger on a team in scope (team region/project; projects where user is PM).
 * Body: { asset_ids: string[], employee_id: string }
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId || assetIds.length === 0) {
    return NextResponse.json({ message: "asset_ids and employee_id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  if (!pmEmployee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", pmEmployee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can assign assets to employees" }, { status: 403 });

  const { data: toEmployee } = await supabase
    .from("employees")
    .select("id, region_id, email, full_name")
    .eq("id", employeeId)
    .single();
  if (!toEmployee) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });

  const { data: qcRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .eq("role", "QC")
    .maybeSingle();
  if (qcRole) {
    return NextResponse.json({ message: "Assets cannot be assigned to QC." }, { status: 400 });
  }

  const onTeam = await targetEmployeeIsOnPmTeam(supabase, pmEmployee, employeeId, session.user.id);
  if (!onTeam) {
    return NextResponse.json(
      {
        message:
          "Assign only to a DT or Driver/Rigger on a team in your scope (team region/project in Admin, or project PM on the project).",
      },
      { status: 400 }
    );
  }

  const { data: availableAssets } = await supabase
    .from("assets")
    .select("id")
    .in("id", assetIds)
    .eq("status", "Available");
  const availableIds = (availableAssets ?? []).map((a) => a.id);
  const now = new Date().toISOString();

  for (const id of availableIds) {
    await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: employeeId,
        status: "Assigned",
        assigned_by: session.user.id,
        assigned_at: now,
      })
      .eq("id", id);
    await supabase.from("asset_assignment_history").insert({
      asset_id: id,
      to_employee_id: employeeId,
      assigned_by_user_id: session.user.id,
      notes: "Assigned by PM from employee portal",
    });
  }

  if (availableIds.length > 0) {
    await upsertPendingReceipts(supabase, {
      employeeId: employeeId,
      assignedByUserId: session.user.id,
      items: availableIds.map((rid) => ({ resourceType: "asset" as const, resourceId: rid })),
    });
  }

  if (availableIds.length > 0 && toEmployee?.email) {
    const { data: recipient } = await supabase
      .from("users_profile")
      .select("id")
      .eq("email", toEmployee.email)
      .maybeSingle();
    if (recipient?.id) {
      await supabase.from("notifications").insert({
        recipient_user_id: recipient.id,
        title: "Confirm receipt: assets assigned",
        body:
          availableIds.length === 1
            ? "An asset was assigned to you. Please open Confirm receipt and confirm you physically received it (optional note)."
            : `${availableIds.length} assets were assigned to you. Please open Confirm receipt and confirm you received them.`,
        category: "assignment_receipt",
        link: "/dashboard/receipts",
        meta: { asset_ids: availableIds, assigned_by: session.user.id },
      });
    }
  }

  return NextResponse.json({
    assigned: availableIds.length,
    skipped: assetIds.length - availableIds.length,
    message: availableIds.length
      ? `Assigned ${availableIds.length} to employee.`
      : "No assets were available to assign.",
  });
}
