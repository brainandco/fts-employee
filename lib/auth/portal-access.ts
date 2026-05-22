import type { Session } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";
import {
  findEmployeeByLoginEmail,
  normalizeLoginEmail,
  syncEmployeeEmailToAuthIfNeeded,
  type PortalEmployeeRow,
} from "@/lib/auth/employee-lookup";

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

type ProfileRow = {
  id: string;
  full_name: string | null;
  status: string;
  avatar_url: string | null;
  must_change_password: boolean | null;
  is_super_user: boolean | null;
  employee_portal_only: boolean | null;
  email: string | null;
};

/** Prefer service role so employee reads are reliable (RLS must not hide the signed-in employee). */
export function getPortalLookupClient(sessionClient: SupabaseClient): SupabaseClient {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServerSupabaseAdmin();
  }
  return sessionClient;
}

async function findUsersProfileForSession(
  lookup: SupabaseClient,
  userId: string,
  authEmail: string
): Promise<ProfileRow | null> {
  const cols =
    "id, full_name, status, avatar_url, must_change_password, is_super_user, employee_portal_only, email";

  const { data: byId } = await lookup.from("users_profile").select(cols).eq("id", userId).maybeSingle();
  if (byId) return byId as ProfileRow;

  const normalized = normalizeLoginEmail(authEmail);
  const { data: byEmail } = await lookup
    .from("users_profile")
    .select(cols)
    .eq("email", normalized)
    .maybeSingle();
  if (byEmail) return byEmail as ProfileRow;

  const raw = authEmail.trim();
  if (raw !== normalized) {
    const { data: byRaw } = await lookup.from("users_profile").select(cols).eq("email", raw).maybeSingle();
    if (byRaw) return byRaw as ProfileRow;
  }

  const { data: ilikeRows } = await lookup.from("users_profile").select(cols).ilike("email", raw).limit(10);
  const hit = (ilikeRows ?? []).find(
    (r) => normalizeLoginEmail(String((r as ProfileRow).email ?? "")) === normalized
  );
  return (hit as ProfileRow | undefined) ?? null;
}

function employeeAccessFromRow(emp: PortalEmployeeRow, email: string): EmployeePortalAccess {
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

  const authEmail = session.user.email;
  const email = normalizeLoginEmail(authEmail);

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
  const usingServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  const [emp, profile] = await Promise.all([
    findEmployeeByLoginEmail(lookup, authEmail),
    findUsersProfileForSession(lookup, session.user.id, authEmail),
  ]);

  if (emp) {
    if (usingServiceRole) {
      await syncEmployeeEmailToAuthIfNeeded(lookup, emp, authEmail);
    }
    return employeeAccessFromRow(emp, email);
  }

  // Portal profile exists but employee row missing — usually email mismatch or record deleted.
  if (profile?.employee_portal_only === true) {
    return {
      kind: "denied",
      reason: "not_found",
      message:
        "We could not find your employee record for this login. Ask your administrator to resend portal credentials from the Employees screen (this refreshes your account link).",
    };
  }

  if (profile && profile.status === "ACTIVE" && !profile.employee_portal_only) {
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
