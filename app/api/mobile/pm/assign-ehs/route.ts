import { NextResponse } from "next/server";
import { getEhsToolType } from "@/lib/assets/ehs-tool-catalog";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — available EHS tools + teams with DT for PM assign (Bearer). Empty arrays when none — do not hard-fail. */
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

    let teamsQuery = supabase
      .from("teams")
      .select("id, name, region_id, dt_employee_id, driver_rigger_employee_id")
      .not("dt_employee_id", "is", null)
      .order("name");

    if (allowedRegionIds.length > 0) {
      teamsQuery = teamsQuery.in("region_id", allowedRegionIds);
    }

    const { data: teamsRaw } = await teamsQuery;
    const empIds = [
      ...new Set(
        (teamsRaw ?? []).flatMap((t) => [t.dt_employee_id, t.driver_rigger_employee_id].filter(Boolean) as string[])
      ),
    ];
    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, full_name, email, status").in("id", empIds)
      : { data: [] };
    const empMap = new Map(
      (emps ?? []).map((e) => [
        e.id as string,
        {
          full_name: ((e.full_name as string | null) ?? (e.email as string | null) ?? "—").trim() || "—",
          status: e.status as string,
        },
      ])
    );

    const teams = (teamsRaw ?? [])
      .filter((t) => {
        const dt = t.dt_employee_id ? empMap.get(t.dt_employee_id as string) : null;
        return dt && dt.status === "ACTIVE";
      })
      .map((t) => {
        const dt = empMap.get(t.dt_employee_id as string)!;
        const driver = t.driver_rigger_employee_id ? empMap.get(t.driver_rigger_employee_id as string) : null;
        return {
          teamId: t.id as string,
          teamName: ((t.name as string) ?? "").trim() || "Team",
          dt: { id: t.dt_employee_id as string, full_name: dt.full_name },
          driver:
            driver && driver.status === "ACTIVE"
              ? { id: t.driver_rigger_employee_id as string, full_name: driver.full_name }
              : null,
        };
      });

    return NextResponse.json({ assets, teams });
  } catch (err) {
    console.error("[mobile/pm/assign-ehs]", err);
    return NextResponse.json({ assets: [], teams: [] });
  }
}
