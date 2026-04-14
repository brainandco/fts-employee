import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  targetEmployeeIsOnPmTeam,
  targetEmployeeIsInPmRegionScope,
} from "@/lib/pm-team-assignees";
import { upsertPendingReceipts } from "@/lib/resource-receipts";

/** PM assigns available SIMs. Body `assignment_mode`: use `region` (default) for employees in PM regions; `team` is legacy. */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assignmentMode: "team" | "region" = body.assignment_mode === "team" ? "team" : "region";
  const simIds = Array.isArray(body.sim_ids) ? body.sim_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId || simIds.length === 0) {
    return NextResponse.json({ message: "sim_ids and employee_id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", session.user.email ?? "")
    .maybeSingle();
  if (!pmEmployee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", pmEmployee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can assign SIMs" }, { status: 403 });

  const { data: toEmployee } = await supabase
    .from("employees")
    .select("id, region_id, email")
    .eq("id", employeeId)
    .single();
  if (!toEmployee) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });

  const { data: qcRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .eq("role", "QC")
    .maybeSingle();
  if (qcRole) return NextResponse.json({ message: "Cannot assign SIMs to QC." }, { status: 400 });

  const inScope =
    assignmentMode === "team"
      ? await targetEmployeeIsOnPmTeam(supabase, pmEmployee, employeeId, session.user.id)
      : await targetEmployeeIsInPmRegionScope(supabase, pmEmployee, employeeId, session.user.id, {
          excludeQc: true,
          requireVehicleRoles: false,
        });
  if (!inScope) {
    return NextResponse.json(
      {
        message:
          assignmentMode === "team"
            ? "Assign only to a DT or Driver/Rigger on a team in your scope (team region/project in Admin, or project PM)."
            : "Assign only to an active employee in one of your regions. QC cannot receive SIMs.",
      },
      { status: 400 }
    );
  }

  const { data: sims } = await supabase
    .from("sim_cards")
    .select("id")
    .in("id", simIds)
    .eq("status", "Available");
  const availableIds = (sims ?? []).map((s) => s.id);
  const now = new Date().toISOString();

  for (const id of availableIds) {
    await supabase.from("sim_cards").update({
      status: "Assigned",
      assigned_to_employee_id: employeeId,
      assigned_by_user_id: session.user.id,
      assigned_at: now,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    }).eq("id", id);

    await supabase.from("sim_assignment_history").insert({
      sim_card_id: id,
      to_employee_id: employeeId,
      assigned_by_user_id: session.user.id,
      notes: "Assigned by PM from employee portal",
    });
  }

  if (availableIds.length > 0) {
    await upsertPendingReceipts(supabase, {
      employeeId: employeeId,
      assignedByUserId: session.user.id,
      items: availableIds.map((rid) => ({ resourceType: "sim_card" as const, resourceId: rid })),
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
        title: "Confirm receipt: SIM(s) assigned",
        body:
          availableIds.length === 1
            ? "A SIM was assigned to you. Please open Confirm receipt and confirm you received the card."
            : `${availableIds.length} SIMs were assigned to you. Please open Confirm receipt to confirm.`,
        category: "assignment_receipt",
        link: "/dashboard/receipts",
        meta: { sim_ids: availableIds, assigned_by: session.user.id },
      });
    }
  }

  return NextResponse.json({
    assigned: availableIds.length,
    skipped: simIds.length - availableIds.length,
    message: availableIds.length
      ? `Assigned ${availableIds.length} SIM(s) to employee.`
      : "No SIMs were available to assign.",
  });
}
