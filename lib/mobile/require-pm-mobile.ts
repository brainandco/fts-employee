import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { getDataClient } from "@/lib/supabase/server";
import type { getRequestAuth } from "@/lib/supabase/request-auth";

export async function requirePmMobileContext(auth: NonNullable<Awaited<ReturnType<typeof getRequestAuth>>>) {
  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return { error: NextResponse.json({ message: "Employee PM access required" }, { status: 403 }) };
  }

  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id, status")
    .eq("id", access.employeeId)
    .maybeSingle();

  if (!employee || employee.status !== "ACTIVE") {
    return { error: NextResponse.json({ message: "Employee not active" }, { status: 403 }) };
  }

  const { data: roleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isPm = (roleRows ?? []).some((r) => r.role === "Project Manager");
  if (!isPm) {
    return { error: NextResponse.json({ message: "Project Manager access required" }, { status: 403 }) };
  }

  const { allowedRegionIds } = await loadPmScopeIds(
    supabase,
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    auth.user.id
  );

  return { supabase, employee, allowedRegionIds, authUserId: auth.user.id };
}
