import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyPmAndQcInRegion } from "@/lib/notifyRegionStaff";

/**
 * Driver/Rigger or Self DT returns their assigned vehicle to the pool (QC/PM notified).
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const employee_comment = typeof body.employee_comment === "string" ? body.employee_comment.trim() : "";
  if (!employee_comment) {
    return NextResponse.json({ message: "employee_comment is required (handover / condition)." }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id, full_name").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: roleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roles = new Set((roleRows ?? []).map((r) => r.role));
  if (!roles.has("Driver/Rigger") && !roles.has("Self DT")) {
    return NextResponse.json({ message: "Only Driver/Rigger or Self DT can return a vehicle this way." }, { status: 403 });
  }

  const { data: assignment } = await supabase
    .from("vehicle_assignments")
    .select("vehicle_id")
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (!assignment?.vehicle_id) {
    return NextResponse.json({ message: "No vehicle is assigned to you." }, { status: 400 });
  }

  const vehicleId = assignment.vehicle_id;

  const { error: delErr } = await supabase.from("vehicle_assignments").delete().eq("vehicle_id", vehicleId);
  if (delErr) return NextResponse.json({ message: delErr.message }, { status: 400 });

  const now = new Date().toISOString();
  const { error: vErr } = await supabase
    .from("vehicles")
    .update({
      status: "Available",
      assigned_region_id: null,
      assigned_by: null,
      assigned_at: null,
    })
    .eq("id", vehicleId);

  if (vErr) return NextResponse.json({ message: vErr.message }, { status: 400 });

  if (employee.region_id) {
    await notifyPmAndQcInRegion(supabase, employee.region_id, {
      title: "Vehicle returned by driver",
      body: `${employee.full_name ?? "Driver"} returned a vehicle. Comment: ${employee_comment.slice(0, 280)}${employee_comment.length > 280 ? "…" : ""}`,
      category: "vehicle_return",
      link: "/dashboard/vehicles/assign",
      linkByRole: {
        pm: "/dashboard/vehicles/assign",
        qc: "/dashboard/region-employees-assets",
      },
      meta: { vehicle_id: vehicleId, employee_id: employee.id },
    });
  }

  return NextResponse.json({ ok: true });
}
