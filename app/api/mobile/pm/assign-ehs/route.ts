import { NextResponse } from "next/server";
import { getEhsToolType } from "@/lib/assets/ehs-tool-catalog";
import { DRIVER_RIGGER_ROLE } from "@/lib/auth/driver-iqama";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — available EHS tools + Driver/Riggers for PM assign (Bearer). `teams` kept empty for older clients. */
export async function GET(req: Request) {
  try {
    const auth = await getRequestAuth(req);
    if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const ctx = await requirePmMobileContext(auth);
    if ("error" in ctx) return ctx.error;

    const { supabase, employee, authUserId } = ctx;
    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      authUserId
    );

    const { data: catalogRows, error: catalogError } = await supabase
      .from("assets")
      .select("id, asset_id, name, category, status, assigned_to_employee_id, ehs_tool_type, en_code")
      .eq("is_ehs_tool", true)
      .order("asset_id");

    if (catalogError) {
      console.error("[mobile/pm/assign-ehs] catalog", catalogError.message);
    }

    const assets = (catalogRows ?? [])
      .filter((a) => a.status === "Available" && !a.assigned_to_employee_id)
      .map((a) => {
        const typeKey = (a.ehs_tool_type as string | null) ?? null;
        const def = typeKey ? getEhsToolType(typeKey) : undefined;
        return {
          id: a.id as string,
          asset_id: (a.asset_id as string | null) ?? null,
          name: (a.name as string | null) ?? def?.label ?? "EHS tool",
          category: (a.category as string | null) ?? null,
          status: a.status as string,
          ehs_tool_type: typeKey,
          en_code: (a.en_code as string | null) ?? def?.enCode ?? null,
          tool_type_label: def?.label ?? typeKey ?? "Other",
        };
      });

    const { data: roleRows } = await supabase
      .from("employee_roles")
      .select("employee_id, role")
      .in("role", [DRIVER_RIGGER_ROLE, "Self DT"]);

    const empIds = [...new Set((roleRows ?? []).map((r) => r.employee_id as string))];
    let drivers: { id: string; full_name: string; region_id: string | null }[] = [];

    if (empIds.length > 0) {
      let empQuery = supabase
        .from("employees")
        .select("id, full_name, email, region_id, status")
        .in("id", empIds)
        .eq("status", "ACTIVE");

      if (allowedRegionIds.length > 0) {
        empQuery = empQuery.in("region_id", allowedRegionIds);
      }

      const { data: emps } = await empQuery.order("full_name");
      drivers = (emps ?? []).map((e) => ({
        id: e.id as string,
        full_name: ((e.full_name as string | null) ?? (e.email as string | null) ?? "Driver/Rigger").trim(),
        region_id: (e.region_id as string | null) ?? null,
      }));
    }

    return NextResponse.json({ assets, drivers, teams: [] });
  } catch (err) {
    console.error("[mobile/pm/assign-ehs]", err);
    return NextResponse.json({ assets: [], drivers: [], teams: [] });
  }
}
