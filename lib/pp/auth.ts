import { findEmployeeByLoginEmail, normalizeLoginEmail } from "@/lib/auth/employee-lookup";
import { employeeNameFolderSlug } from "@/lib/employee-files/storage";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type PpSessionContext = {
  employeeId: string;
  email: string;
  fullName: string | null;
  /** Stable folder segment under the PP reports bucket for this user (server-derived). */
  reporterFolderSlug: string;
};

/** Canonical roles for the reporting workspace (field files + final reports bucket), same nav as legacy PP. */
export const REPORTING_PORTAL_ROLES = ["PP", "Reporting Team"] as const;

export function hasReportingPortalRole(roles: { role: string }[] | null | undefined): boolean {
  return (roles ?? []).some((r) => r.role === "PP" || r.role === "Reporting Team");
}

/**
 * Team-wide leave queue (`/dashboard/pp/leaves`) is for **PP** (post processor) only.
 * **Reporting Team** without PP uses `/leave` for their own requests only.
 */
export function canAccessPpTeamLeaveRequests(roles: { role: string }[] | null | undefined): boolean {
  return (roles ?? []).some((r) => r.role === "PP");
}

/** Resolve reporting workspace (PP or Reporting Team) from session. */
export async function getPostProcessorContext(): Promise<PpSessionContext | null> {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.email) return null;

  const email = normalizeLoginEmail(session.user.email);
  const supabase = await getDataClient();
  const employee = await findEmployeeByLoginEmail(supabase, session.user.email);

  if (!employee || employee.status !== "ACTIVE") return null;

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  if (!hasReportingPortalRole(roles ?? [])) return null;

  const fullName = (employee.full_name as string | null) ?? null;
  return {
    employeeId: employee.id as string,
    email,
    fullName,
    reporterFolderSlug: employeeNameFolderSlug(fullName, employee.id as string),
  };
}

export async function requirePostProcessor(): Promise<PpSessionContext | NextResponse> {
  const ctx = await getPostProcessorContext();
  if (!ctx) {
    return NextResponse.json({ message: "Forbidden — reporting workspace access only." }, { status: 403 });
  }
  return ctx;
}
