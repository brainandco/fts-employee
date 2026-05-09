import type { SupabaseClient } from "@supabase/supabase-js";

/** Seed role UUID — `roles.name = 'Administrator'`. */
export const ADMINISTRATOR_ROLE_ID = "a0000000-0000-0000-0000-000000000001";
/** Seed role UUID — `roles.name = 'Super User'`. */
export const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

export type LeaveGuarantorPickerMode = "same_region" | "pm_picks_admin" | "admin_picks_pm";

/** Exact ILIKE match (escapes `%` and `_` for PostgREST `ilike`). */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * PM ↔ Administrator guarantor routing only. Everyone else uses same-region guarantors.
 * If the user is both Administrator (portal) and PM (employee role), Administrator rule wins.
 */
export async function resolveLeaveGuarantorPickerMode(
  supabase: SupabaseClient,
  authUserId: string,
  applicantEmployeeId: string
): Promise<LeaveGuarantorPickerMode> {
  const adminPortalUser = await isAdministratorPortalUser(supabase, authUserId);
  if (adminPortalUser) return "admin_picks_pm";

  const isPm = await employeeHasRole(supabase, applicantEmployeeId, "Project Manager");
  if (isPm) return "pm_picks_admin";

  return "same_region";
}

export async function isAdministratorPortalUser(supabase: SupabaseClient, authUserId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from("users_profile")
    .select("is_super_user, status")
    .eq("id", authUserId)
    .maybeSingle();
  if (!profile || profile.status !== "ACTIVE") return false;
  if (profile.is_super_user) return true;
  const { data: rows } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", authUserId)
    .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID]);
  return !!rows?.length;
}

export async function employeeHasRole(supabase: SupabaseClient, employeeId: string, role: string): Promise<boolean> {
  const { data } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("employee_id", employeeId)
    .eq("role", role)
    .maybeSingle();
  return !!data;
}

/** Active employees with Project Manager role (any region). Excludes applicant. */
export async function fetchActiveProjectManagerEmployees(
  supabase: SupabaseClient,
  excludeEmployeeId: string
): Promise<{ id: string; full_name: string | null; job_title: string | null; department: string | null }[]> {
  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id")
    .eq("role", "Project Manager");
  const ids = [...new Set((roleRows ?? []).map((r) => r.employee_id as string).filter(Boolean))].filter(
    (id) => id !== excludeEmployeeId
  );
  if (ids.length === 0) return [];
  const { data: rows } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department")
    .in("id", ids)
    .eq("status", "ACTIVE")
    .order("full_name");
  return (rows ?? []) as { id: string; full_name: string | null; job_title: string | null; department: string | null }[];
}

/**
 * Active employees whose portal account is Super User or Administrator (matched by email).
 * Excludes applicant. Not filtered by region.
 */
export async function fetchAdministratorEmployeeGuarantors(
  supabase: SupabaseClient,
  excludeEmployeeId: string
): Promise<{ id: string; full_name: string | null; job_title: string | null; department: string | null }[]> {
  const adminUserIds = new Set<string>();
  const { data: flagSupers } = await supabase.from("users_profile").select("id").eq("status", "ACTIVE").eq("is_super_user", true);
  for (const p of flagSupers ?? []) adminUserIds.add(p.id as string);

  const { data: namedRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID]);
  for (const r of namedRoles ?? []) adminUserIds.add(r.user_id as string);

  if (adminUserIds.size === 0) return [];

  const { data: profiles } = await supabase
    .from("users_profile")
    .select("id, email")
    .eq("status", "ACTIVE")
    .in("id", [...adminUserIds]);

  const emails = new Set<string>();
  for (const p of profiles ?? []) {
    const em = String(p.email ?? "").trim().toLowerCase();
    if (em) emails.add(em);
  }
  if (emails.size === 0) return [];

  const emailList = [...emails];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department, email")
    .eq("status", "ACTIVE")
    .in("email", emailList);

  const out = (emps ?? []).filter((e) => e.id !== excludeEmployeeId && emails.has(String(e.email ?? "").trim().toLowerCase()));
  out.sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? ""), undefined, { sensitivity: "base" }));
  return out.map((e) => ({
    id: e.id as string,
    full_name: e.full_name,
    job_title: e.job_title,
    department: e.department,
  }));
}

export async function assertGuarantorAllowedForMode(
  supabase: SupabaseClient,
  mode: LeaveGuarantorPickerMode,
  applicantEmployeeId: string,
  guarantorEmployeeId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (guarantorEmployeeId === applicantEmployeeId) {
    return { ok: false, message: "You cannot select yourself as guarantor" };
  }

  const { data: guarantor } = await supabase
    .from("employees")
    .select("id, email, status")
    .eq("id", guarantorEmployeeId)
    .maybeSingle();
  if (!guarantor || guarantor.status !== "ACTIVE") {
    return { ok: false, message: "Guarantor not found or inactive" };
  }

  if (mode === "same_region") {
    const { data: applicant } = await supabase.from("employees").select("region_id").eq("id", applicantEmployeeId).maybeSingle();
    const { data: guFull } = await supabase.from("employees").select("region_id").eq("id", guarantorEmployeeId).maybeSingle();
    if (!applicant?.region_id) {
      return { ok: false, message: "Your employee record has no region; contact admin." };
    }
    if (applicant.region_id !== guFull?.region_id) {
      return { ok: false, message: "Guarantor must be in the same region as you" };
    }
    return { ok: true };
  }

  if (mode === "admin_picks_pm") {
    const ok = await employeeHasRole(supabase, guarantorEmployeeId, "Project Manager");
    if (!ok) return { ok: false, message: "Guarantor must be an active Project Manager." };
    return { ok: true };
  }

  if (mode === "pm_picks_admin") {
    const email = String(guarantor.email ?? "").trim().toLowerCase();
    if (!email) return { ok: false, message: "Selected guarantor has no email on file." };
    const { data: up } = await supabase
      .from("users_profile")
      .select("id, is_super_user")
      .ilike("email", escapeIlikeExact(email))
      .maybeSingle();
    if (!up) return { ok: false, message: "Guarantor must be an Administrator portal user with a matching employee profile." };
    if (up.is_super_user) return { ok: true };
    const { data: ur } = await supabase
      .from("user_roles")
      .select("role_id")
      .eq("user_id", up.id)
      .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID]);
    if (!ur?.length) return { ok: false, message: "Guarantor must be an Administrator or Super User (portal role)." };
    return { ok: true };
  }

  return { ok: true };
}
