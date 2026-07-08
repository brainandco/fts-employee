import { NextResponse } from "next/server";
import { canEmployeeInitiateAssetReturn } from "@/lib/asset-return-eligibility";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — assets + EHS tools assigned to the signed-in employee (Bearer token). */
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
    .select(
      "id, name, category, model, serial, imei_1, imei_2, status, asset_id, is_ehs_tool, ehs_wear_role, ehs_tool_type, en_code, ehs_for_employee_id"
    )
    .eq("assigned_to_employee_id", access.employeeId)
    .order("name");

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const driverIds = [
    ...new Set(
      (assets ?? [])
        .filter((a) => a.is_ehs_tool && a.ehs_for_employee_id)
        .map((a) => a.ehs_for_employee_id as string)
    ),
  ];
  const { data: drivers } = driverIds.length
    ? await supabase.from("employees").select("id, full_name, email").in("id", driverIds)
    : { data: [] };
  const driverNameById = new Map(
    (drivers ?? []).map((e) => [e.id as string, ((e.full_name as string | null) ?? (e.email as string | null) ?? "Driver").trim()])
  );

  const items = (assets ?? []).map((a) => {
    const isEhs = !!(a.is_ehs_tool as boolean | null);
    const wear = (a.ehs_wear_role as string | null) ?? null;
    const forId = (a.ehs_for_employee_id as string | null) ?? null;
    return {
      id: a.id as string,
      name: a.name as string,
      category: (a.category as string | null) ?? null,
      model: (a.model as string | null) ?? null,
      serial: (a.serial as string | null) ?? null,
      imei_1: (a.imei_1 as string | null) ?? null,
      imei_2: (a.imei_2 as string | null) ?? null,
      status: a.status as string,
      canReturn: canEmployeeInitiateAssetReturn(a.status as string),
      asset_id: (a.asset_id as string | null) ?? null,
      is_ehs_tool: isEhs,
      ehs_wear_role: wear,
      ehs_tool_type: (a.ehs_tool_type as string | null) ?? null,
      en_code: (a.en_code as string | null) ?? null,
      ehs_for_employee_id: forId,
      worn_by_label:
        isEhs && wear === "driver_rigger" && forId ? (driverNameById.get(forId) ?? "Driver/Rigger") : null,
    };
  });

  return NextResponse.json({ items });
}
