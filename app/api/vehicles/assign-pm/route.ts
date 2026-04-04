import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  targetEmployeeIsOnPmTeam,
  targetEmployeeIsInPmRegionScope,
  loadPmScopeIds,
} from "@/lib/pm-team-assignees";
import { upsertPendingReceipts } from "@/lib/resource-receipts";

/** PM assigns available vehicles to Driver/Rigger or Self DT on a team in scope (team region/project; projects where user is PM). */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assignmentMode = body.assignment_mode === "region" ? "region" : "team";
  const vehicleIds = Array.isArray(body.vehicle_ids) ? body.vehicle_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId || vehicleIds.length === 0) {
    return NextResponse.json({ message: "vehicle_ids and employee_id required" }, { status: 400 });
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
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can assign vehicles" }, { status: 403 });

  const { data: toEmployee } = await supabase
    .from("employees")
    .select("id, region_id, email")
    .eq("id", employeeId)
    .single();
  if (!toEmployee) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });

  const inScope =
    assignmentMode === "team"
      ? await targetEmployeeIsOnPmTeam(supabase, pmEmployee, employeeId, session.user.id)
      : await targetEmployeeIsInPmRegionScope(supabase, pmEmployee, employeeId, session.user.id, {
          excludeQc: false,
          requireVehicleRoles: true,
        });
  if (!inScope) {
    return NextResponse.json(
      {
        message:
          assignmentMode === "team"
            ? "Assign only to a team member (DT or Driver/Rigger) on a team in your scope (team region/project in Admin, or project PM)."
            : "Assign only to Driver/Rigger or Self DT in one of your regions (primary or extra regions from Admin).",
      },
      { status: 400 }
    );
  }

  const { data: allowedVehicleRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .in("role", ["Driver/Rigger", "Self DT"]);
  if (!(allowedVehicleRole ?? []).length) {
    return NextResponse.json({ message: "Vehicles can only be assigned to Driver/Rigger or Self DT." }, { status: 400 });
  }

  const { data: existingEmpVehicle } = await supabase
    .from("vehicle_assignments")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (existingEmpVehicle) {
    return NextResponse.json({ message: "Employee already has an assigned vehicle." }, { status: 400 });
  }

  const { data: assignRows } = await supabase
    .from("vehicle_assignments")
    .select("vehicle_id")
    .in("vehicle_id", vehicleIds);
  const alreadyAssigned = new Set((assignRows ?? []).map((r) => r.vehicle_id));

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, status, assigned_region_id, plate_number")
    .in("id", vehicleIds)
    .eq("status", "Available");

  const { allowedRegionIds } = await loadPmScopeIds(supabase, pmEmployee, session.user.id);
  const eligible = (vehicles ?? []).filter((v) => {
    if (alreadyAssigned.has(v.id)) return false;
    const rid = v.assigned_region_id as string | null;
    if (!rid) return true;
    if (allowedRegionIds.length > 0) return allowedRegionIds.includes(rid);
    return rid === pmEmployee.region_id;
  });
  if (eligible.length === 0) {
    return NextResponse.json({ message: "No selected vehicles are available for assignment." }, { status: 400 });
  }

  const now = new Date().toISOString();
  for (const v of eligible) {
    await supabase.from("vehicle_assignments").insert({
      vehicle_id: v.id,
      employee_id: employeeId,
    });
    await supabase.from("vehicles").update({
      status: "Assigned",
      assigned_region_id: toEmployee.region_id ?? pmEmployee.region_id,
      assigned_by: session.user.id,
      assigned_at: now,
    }).eq("id", v.id);
  }

  if (eligible.length > 0) {
    await upsertPendingReceipts(supabase, {
      employeeId: employeeId,
      assignedByUserId: session.user.id,
      items: eligible.map((v) => ({ resourceType: "vehicle" as const, resourceId: v.id })),
    });
  }

  if (toEmployee.email) {
    const { data: recipient } = await supabase
      .from("users_profile")
      .select("id")
      .eq("email", toEmployee.email)
      .maybeSingle();
    if (recipient?.id && eligible.length > 0) {
      await supabase.from("notifications").insert({
        recipient_user_id: recipient.id,
        title: "Confirm receipt: vehicle assigned",
        body:
          eligible.length === 1
            ? "A vehicle was assigned to you. Please open Confirm receipt and confirm you received keys/access."
            : `${eligible.length} vehicles were assigned to you. Please open Confirm receipt to confirm receipt.`,
        category: "assignment_receipt",
        link: "/dashboard/receipts",
        meta: { vehicle_ids: eligible.map((v) => v.id), assigned_by: session.user.id },
      });
    }
  }

  return NextResponse.json({
    assigned: eligible.length,
    skipped: vehicleIds.length - eligible.length,
    message: `Assigned ${eligible.length} vehicle(s) to employee.`,
  });
}
