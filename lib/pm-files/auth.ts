import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";

export const PM_EMPLOYEE_FILES_ROLE = "Project Manager";

export type PmFilesGate =
  | {
      employeeId: string;
      authUserId: string;
      allowedRegionIds: string[];
    }
  | NextResponse;

/** Active employee with Project Manager role; regions = primary + pm_region_assignments (+ projects.pm_user_id scope via loadPmScopeIds). */
export async function requirePmEmployeeFilesAccess(): Promise<PmFilesGate> {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, status, region_id, project_id")
    .eq("email", email)
    .maybeSingle();

  if (!employee || employee.status !== "ACTIVE") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const hasPm = (roles ?? []).some((r) => r.role === PM_EMPLOYEE_FILES_ROLE);
  if (!hasPm) {
    return NextResponse.json({ message: "Forbidden — Project Manager access only." }, { status: 403 });
  }

  const { allowedRegionIds } = await loadPmScopeIds(
    supabase,
    {
      id: employee.id,
      region_id: employee.region_id,
      project_id: employee.project_id,
    },
    session.user.id
  );

  if (allowedRegionIds.length === 0) {
    return NextResponse.json({ message: "No regions assigned for your account." }, { status: 403 });
  }

  return {
    employeeId: employee.id,
    authUserId: session.user.id,
    allowedRegionIds,
  };
}

export function pmRegionForbidden(): NextResponse {
  return NextResponse.json({ message: "Region not allowed for your PM scope." }, { status: 403 });
}

export function assertPmRegion(regionId: string, allowedRegionIds: string[]): boolean {
  return allowedRegionIds.includes(regionId);
}

/** Server Components: redirect if the signed-in user cannot use PM employee files / PP bucket UI. */
export async function assertPmEmployeeFilesPageAccess(): Promise<{
  employeeId: string;
  authUserId: string;
  allowedRegionIds: string[];
}> {
  const r = await requirePmEmployeeFilesAccess();
  if (r instanceof NextResponse) {
    if (r.status === 401) redirect("/login");
    redirect("/dashboard");
  }
  return r;
}
