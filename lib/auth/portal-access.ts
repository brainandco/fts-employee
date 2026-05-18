import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";

export type EmployeePortalAccess =
  | {
      kind: "employee";
      email: string;
      employeeId: string;
      fullName: string | null;
      regionId: string | null;
      avatarUrl: string | null;
      mustChangePassword: boolean;
    }
  | {
      kind: "admin_view";
      email: string;
      profileId: string;
      fullName: string | null;
      avatarUrl: string | null;
      mustChangePassword: boolean;
      isSuperUser: boolean;
    }
  | {
      kind: "denied";
      reason: "misconfigured" | "inactive" | "not_found";
      message: string;
    };

type EmployeeRow = {
  id: string;
  full_name: string | null;
  status: string;
  region_id: string | null;
  avatar_url: string | null;
  must_change_password: boolean | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  status: string;
  avatar_url: string | null;
  must_change_password: boolean | null;
  is_super_user: boolean | null;
  employee_portal_only: boolean | null;
};

/** Prefer service role so employee reads are reliable (RLS must not hide the signed-in employee). */
export function getPortalLookupClient(sessionClient: SupabaseClient): SupabaseClient {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServerSupabaseAdmin();
  }
  return sessionClient;
}

export async function resolveEmployeePortalAccess(session: Session | null): Promise<EmployeePortalAccess> {
  if (!getSupabaseUrlAndAnonKey()) {
    return {
      kind: "denied",
      reason: "misconfigured",
      message: "Employee portal is temporarily unavailable. Please try again later or contact support.",
    };
  }

  if (!session?.user?.email) {
    return {
      kind: "denied",
      reason: "not_found",
      message: "Sign in required.",
    };
  }

  const email = session.user.email.trim().toLowerCase();
  let sessionClient: SupabaseClient;
  try {
    sessionClient = await createServerSupabaseClient();
  } catch {
    return {
      kind: "denied",
      reason: "misconfigured",
      message: "Employee portal is temporarily unavailable. Please try again later or contact support.",
    };
  }

  const lookup = getPortalLookupClient(sessionClient);

  const [{ data: employee }, { data: userProfile }] = await Promise.all([
    lookup
      .from("employees")
      .select("id, full_name, status, region_id, avatar_url, must_change_password")
      .eq("email", email)
      .maybeSingle(),
    lookup
      .from("users_profile")
      .select("id, full_name, status, avatar_url, must_change_password, is_super_user, employee_portal_only")
      .eq("email", email)
      .maybeSingle(),
  ]);

  const emp = employee as EmployeeRow | null;
  const profile = userProfile as ProfileRow | null;

  if (emp) {
    if (emp.status !== "ACTIVE") {
      return {
        kind: "denied",
        reason: "inactive",
        message:
          "Your employee account is inactive. Please contact your administrator to activate your account before you can access the Employee Portal.",
      };
    }
    return {
      kind: "employee",
      email,
      employeeId: emp.id,
      fullName: emp.full_name,
      regionId: emp.region_id,
      avatarUrl: emp.avatar_url,
      mustChangePassword: emp.must_change_password === true,
    };
  }

  // users_profile row for an employee email must never grant "admin view" on the employee portal.
  if (profile?.employee_portal_only === true) {
    return {
      kind: "denied",
      reason: "not_found",
      message:
        "Your employee record could not be loaded. Contact your administrator — use the Employee Portal link from your credentials email, not the Admin Portal.",
    };
  }

  if (profile && profile.status === "ACTIVE") {
    return {
      kind: "admin_view",
      email,
      profileId: profile.id,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      mustChangePassword: profile.must_change_password === true,
      isSuperUser: profile.is_super_user === true,
    };
  }

  return {
    kind: "denied",
    reason: "not_found",
    message: "No active employee account for this sign-in. Use the Employee Portal URL from your administrator.",
  };
}

/** Admin portal link — never default to "/" (same host) which confuses employees. */
export function getOptionalAdminPortalUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "").trim();
  if (!raw || raw === "/") return null;
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(url).origin;
  } catch {
    return null;
  }
}
