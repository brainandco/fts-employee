import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type PpSessionContext = {
  employeeId: string;
  email: string;
};

/** Canonical roles for the reporting workspace (field files + final reports bucket), same nav as legacy PP. */
export const REPORTING_PORTAL_ROLES = ["PP", "Reporting Team"] as const;

export function hasReportingPortalRole(roles: { role: string }[] | null | undefined): boolean {
  return (roles ?? []).some((r) => r.role === "PP" || r.role === "Reporting Team");
}

/** Resolve reporting workspace (PP or Reporting Team) from session. */
export async function getPostProcessorContext(): Promise<PpSessionContext | null> {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.email) return null;

  const email = session.user.email.trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  if (!employee || employee.status !== "ACTIVE") return null;

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  if (!hasReportingPortalRole(roles ?? [])) return null;

  return { employeeId: employee.id as string, email };
}

export async function requirePostProcessor(): Promise<PpSessionContext | NextResponse> {
  const ctx = await getPostProcessorContext();
  if (!ctx) {
    return NextResponse.json({ message: "Forbidden — reporting workspace access only." }, { status: 403 });
  }
  return ctx;
}
