import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { targetEmployeeIsOnPmTeam } from "@/lib/pm-team-assignees";

/** PM assigns available SIM cards to a DT or Driver/Rigger on a team in their region (and project when set). */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
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
  if (toEmployee.region_id !== pmEmployee.region_id) {
    return NextResponse.json({ message: "You can only assign SIMs to employees in your region" }, { status: 400 });
  }

  const { data: qcRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .eq("role", "QC")
    .maybeSingle();
  if (qcRole) return NextResponse.json({ message: "Cannot assign SIMs to QC." }, { status: 400 });

  const onTeam = await targetEmployeeIsOnPmTeam(supabase, pmEmployee, employeeId);
  if (!onTeam) {
    return NextResponse.json(
      {
        message:
          "Assign only to a DT or Driver/Rigger on a team in your region (and project, when your record has a project).",
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

  if (availableIds.length > 0 && toEmployee?.email) {
    const { data: recipient } = await supabase
      .from("users_profile")
      .select("id")
      .eq("email", toEmployee.email)
      .maybeSingle();
    if (recipient?.id) {
      await supabase.from("notifications").insert({
        recipient_user_id: recipient.id,
        title: "SIM assigned to you",
        body: `${availableIds.length} SIM(s) were assigned to you by PM.`,
        category: "sim_assignment",
        link: "/dashboard",
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
