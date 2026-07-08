import { NextResponse } from "next/server";
import { loadTeamEhsAssignments } from "@/lib/assets/load-team-ehs-assignments";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — team-wise EHS who-has for PM scope (Bearer). Empty teams when none assigned — never hard-fail on empty data. */
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

    let scopeLabel = "No region scope";
    if (allowedRegionIds.length === 1) {
      const { data: regionRow } = await supabase
        .from("regions")
        .select("name, code")
        .eq("id", allowedRegionIds[0]!)
        .maybeSingle();
      scopeLabel = `${regionRow?.name ?? "—"}${regionRow?.code ? ` · ${regionRow.code}` : ""}`;
    } else if (allowedRegionIds.length > 1) {
      scopeLabel = `${allowedRegionIds.length} regions`;
    }

    if (allowedRegionIds.length === 0) {
      return NextResponse.json({ scopeLabel, teams: [] });
    }

    const teams = await loadTeamEhsAssignments(supabase, { regionIds: allowedRegionIds });
    return NextResponse.json({ scopeLabel, teams: teams ?? [] });
  } catch (err) {
    console.error("[mobile/pm/who-has-ehs]", err);
    return NextResponse.json({ scopeLabel: "", teams: [] });
  }
}
