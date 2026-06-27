import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — SIM cards assigned to the signed-in employee (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee access only" }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: sims, error } = await supabase
    .from("sim_cards")
    .select("id, sim_number, phone_number, operator, service_type, status")
    .eq("assigned_to_employee_id", access.employeeId)
    .order("assigned_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const items = (sims ?? []).map((s) => ({
    id: s.id as string,
    sim_number: (s.sim_number as string | null) ?? null,
    phone_number: (s.phone_number as string | null) ?? null,
    operator: (s.operator as string | null) ?? null,
    service_type: (s.service_type as string | null) ?? null,
    status: s.status as string,
    canReturn: s.status === "Assigned",
  }));

  return NextResponse.json({ items });
}
