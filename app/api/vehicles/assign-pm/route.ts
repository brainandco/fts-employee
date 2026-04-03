import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** PM assigns available vehicles to employee in same region. */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const vehicleIds = Array.isArray(body.vehicle_ids) ? body.vehicle_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId || vehicleIds.length === 0) {
    return NextResponse.json({ message: "vehicle_ids and employee_id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id")
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
  if (toEmployee.region_id !== pmEmployee.region_id) {
    return NextResponse.json({ message: "You can only assign vehicles to employees in your region" }, { status: 400 });
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

  const eligible = (vehicles ?? []).filter((v) => !alreadyAssigned.has(v.id) && (!v.assigned_region_id || v.assigned_region_id === pmEmployee.region_id));
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
      assigned_region_id: pmEmployee.region_id,
      assigned_by: session.user.id,
      assigned_at: now,
    }).eq("id", v.id);
  }

  if (toEmployee.email) {
    const { data: recipient } = await supabase
      .from("users_profile")
      .select("id")
      .eq("email", toEmployee.email)
      .maybeSingle();
    if (recipient?.id) {
      await supabase.from("notifications").insert({
        recipient_user_id: recipient.id,
        title: "Vehicle assigned to you",
        body: `${eligible.length} vehicle(s) were assigned to you by PM.`,
        category: "vehicle_assignment",
        link: "/dashboard",
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
