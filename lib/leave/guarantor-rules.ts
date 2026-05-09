import type { SupabaseClient } from "@supabase/supabase-js";

/** Seed role UUID — `roles.name = 'Administrator'`. */
export const ADMINISTRATOR_ROLE_ID = "a0000000-0000-0000-0000-000000000001";
/** Seed role UUID — `roles.name = 'Super User'`. */
export const SUPER_ROLE_ID = "a0000000-0000-0000-0000-000000000000";

export type LeaveGuarantorPickerMode = "same_region" | "pm_picks_admin" | "admin_picks_pm";

async function collectAdministratorPortalUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const adminUserIds = new Set<string>();
  const { data: flagSupers } = await supabase.from("users_profile").select("id").eq("status", "ACTIVE").eq("is_super_user", true);
  for (const p of flagSupers ?? []) adminUserIds.add(p.id as string);

  const { data: namedRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", [SUPER_ROLE_ID, ADMINISTRATOR_ROLE_ID]);
  for (const r of namedRoles ?? []) adminUserIds.add(r.user_id as string);

  return adminUserIds;
}

/**
 * PM ↔ Administrator guarantor routing only. Everyone else uses same-region guarantors.
 * If the user is both Administrator (portal) and PM (employee), Administrator rule wins.
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

export type PortalAdminGuarantorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  subtitle: string;
};

/**
 * Active portal users who are Super User or Administrator (by flag or role).
 * Excludes the applicant's auth user so they cannot pick themselves. IDs are `users_profile.id`.
 */
export async function fetchAdministratorPortalUsersForPmGuarantor(
  supabase: SupabaseClient,
  excludeAuthUserId: string
): Promise<PortalAdminGuarantorRow[]> {
  const adminUserIds = await collectAdministratorPortalUserIds(supabase);
  adminUserIds.delete(excludeAuthUserId);
  if (adminUserIds.size === 0) return [];

  const { data: profiles } = await supabase
    .from("users_profile")
    .select("id, full_name, email, is_super_user")
    .eq("status", "ACTIVE")
    .in("id", [...adminUserIds]);

  const list = profiles ?? [];
  if (list.length === 0) return [];

  const userIds = list.map((p) => p.id as string);
  const { data: roleRows } = await supabase.from("user_roles").select("user_id, roles(name)").in("user_id", userIds);

  const subtitleSets = new Map<string, Set<string>>();
  for (const p of list) {
    const s = new Set<string>();
    if (p.is_super_user) s.add("Super User");
    subtitleSets.set(p.id as string, s);
  }
  for (const r of roleRows ?? []) {
    const uid = r.user_id as string;
    const roleName = (r as { roles?: { name?: string } | null }).roles?.name;
    if (!subtitleSets.has(uid)) subtitleSets.set(uid, new Set());
    if (roleName) subtitleSets.get(uid)!.add(String(roleName).trim());
  }

  const out: PortalAdminGuarantorRow[] = list.map((p) => {
    const id = p.id as string;
    const labels = [...(subtitleSets.get(id) ?? new Set())].sort((a, b) => a.localeCompare(b));
    return {
      id,
      full_name: p.full_name,
      email: p.email,
      subtitle: labels.length ? labels.join(", ") : "Portal administrator",
    };
  });
  out.sort((a, b) =>
    String(a.full_name ?? a.email ?? "").localeCompare(String(b.full_name ?? b.email ?? ""), undefined, {
      sensitivity: "base",
    })
  );
  return out;
}

/** PM employee: guarantor is a portal Administrator / Super User (`users_profile.id`), not an employee row. */
export async function assertPortalAdminGuarantorForPmApplicant(
  supabase: SupabaseClient,
  applicantAuthUserId: string,
  guarantorUserId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (guarantorUserId === applicantAuthUserId) {
    return { ok: false, message: "You cannot select yourself as guarantor" };
  }
  const { data: profile } = await supabase.from("users_profile").select("id, status").eq("id", guarantorUserId).maybeSingle();
  if (!profile || profile.status !== "ACTIVE") {
    return { ok: false, message: "Guarantor not found or inactive" };
  }
  const okAdmin = await isAdministratorPortalUser(supabase, guarantorUserId);
  if (!okAdmin) {
    return { ok: false, message: "Guarantor must be a portal Administrator or Super User." };
  }
  return { ok: true };
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
    .select("id, status")
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

  return { ok: true };
}
