import { NextResponse } from "next/server";
import { loadPmAssignAssetsData } from "@/lib/mobile/pm-assign-data";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — PM assign assets pool + search catalog + assignees (Bearer). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ctx = await requirePmMobileContext(auth);
  if ("error" in ctx) return ctx.error;

  const { supabase, employee, authUserId } = ctx;
  const data = await loadPmAssignAssetsData(
    supabase,
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    authUserId
  );

  return NextResponse.json(data);
}
