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
  if (!assignment?.vehicle_id) {
    return NextResponse.json({ items: [], canReturnVehicle });
  }

  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("id, plate_number, make, model, status")
    .eq("id", assignment.vehicle_id)
    .maybeSingle();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  if (!vehicle) return NextResponse.json({ items: [], canReturnVehicle });

  return NextResponse.json({
    canReturnVehicle,
    items: [
      {
        id: vehicle.id as string,
        plate_number: (vehicle.plate_number as string | null) ?? null,
        make: (vehicle.make as string | null) ?? null,
        model: (vehicle.model as string | null) ?? null,
        status: vehicle.status as string,
        canReturn: canReturnVehicle,
      },
    ],
  });
}
