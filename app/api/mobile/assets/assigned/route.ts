import { NextResponse } from "next/server";
import { canEmployeeInitiateAssetReturn } from "@/lib/asset-return-eligibility";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — assets assigned to the signed-in employee (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee access only" }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, name, category, model, serial, imei_1, imei_2, status")
    .eq("assigned_to_employee_id", access.employeeId)
    .order("name");

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const items = (assets ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    category: (a.category as string | null) ?? null,
    model: (a.model as string | null) ?? null,
    serial: (a.serial as string | null) ?? null,
    imei_1: (a.imei_1 as string | null) ?? null,
    imei_2: (a.imei_2 as string | null) ?? null,
    status: a.status as string,
    canReturn: canEmployeeInitiateAssetReturn(a.status as string),
  }));

  return NextResponse.json({ items });
}
