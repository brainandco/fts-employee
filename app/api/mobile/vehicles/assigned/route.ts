import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { isVehicleAssigneeRole } from "@/lib/employees/vehicle-assignment-roles";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — vehicles assigned to the signed-in employee (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee access only" }, { status: 403 });
  }

  const supabase = await getDataClient();
  const [{ data: roles }, { data: assignment }] = await Promise.all([
    supabase.from("employee_roles").select("role").eq("employee_id", access.employeeId),
    supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", access.employeeId).maybeSingle(),
  ]);

  const canReturnVehicle = (roles ?? []).some((r) => isVehicleAssigneeRole(r.role as string));
  const isDriverRigger = (roles ?? []).some((r) => r.role === "Driver/Rigger");
  if (!assignment?.vehicle_id) {
    return NextResponse.json({ items: [], canReturnVehicle, isDriverRigger });
  }

  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, plate_number, make, model, status")
    .eq("id", assignment.vehicle_id)
    .maybeSingle();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  if (!vehicle) return NextResponse.json({ items: [], canReturnVehicle, isDriverRigger });

  const { data: openShift } = await supabase
    .from("vehicle_duty_shifts")
    .select("id, started_at, start_km, shift_date, status")
    .eq("vehicle_id", assignment.vehicle_id)
    .eq("employee_id", access.employeeId)
    .eq("status", "open")
    .maybeSingle();

  const dutyOpen = Boolean(openShift);
  return NextResponse.json({
    canReturnVehicle,
    isDriverRigger,
    items: [
      {
        id: vehicle.id as string,
        plate_number: (vehicle.plate_number as string | null) ?? null,
        make: (vehicle.make as string | null) ?? null,
        model: (vehicle.model as string | null) ?? null,
        status: vehicle.status as string,
        canReturn: canReturnVehicle,
        duty: {
          status: dutyOpen ? "open" : "idle",
          startedAt: openShift ? String(openShift.started_at) : null,
          startKm: typeof openShift?.start_km === "number" ? openShift.start_km : openShift?.start_km != null ? Number(openShift.start_km) : null,
        },
        todayOdometer: {
          morningSubmitted: dutyOpen,
          eveningSubmitted: false,
          morningAt: openShift ? String(openShift.started_at) : null,
          eveningAt: null,
        },
      },
    ],
  });
}
