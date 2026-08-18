import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DRIVER_RIGGER_ROLE,
  isUsableLoginEmail,
  looksLikeIqamaIdentifier,
  normalizeIqama,
  normalizeLoginEmail,
} from "@/lib/auth/driver-iqama";

export type ResolveLoginEmailResult =
  | { ok: true; email: string }
  | { ok: false; message: string; status: number };

const GENERIC_IQAMA_ERROR =
  "Invalid Iqama or password. Driver/Rigger login uses Iqama number. Other roles use email.";

/**
 * Map a login identifier to the Auth email.
 * Iqama is allowed only for ACTIVE Driver/Rigger employees.
 */
export async function resolveLoginEmailFromIdentifier(identifierRaw: string): Promise<ResolveLoginEmailResult> {
  const identifier = identifierRaw.trim();
  if (!identifier) {
    return { ok: false, message: "Iqama or email and password required", status: 400 };
  }

  if (!looksLikeIqamaIdentifier(identifier)) {
    const email = normalizeLoginEmail(identifier);
    if (!email.includes("@")) {
      return { ok: false, message: GENERIC_IQAMA_ERROR, status: 401 };
    }
    return { ok: true, email };
  }

  const iqama = normalizeIqama(identifier);
  const admin = createServerSupabaseAdmin();
  const { data: employees, error } = await admin
    .from("employees")
    .select("id, email, status, iqama_number")
    .eq("status", "ACTIVE");
  if (error) {
    return { ok: false, message: "Login is temporarily unavailable", status: 503 };
  }

  const matches = (employees ?? []).filter((row) => normalizeIqama(String(row.iqama_number ?? "")) === iqama);
  if (matches.length !== 1) {
    return { ok: false, message: GENERIC_IQAMA_ERROR, status: 401 };
  }

  const employee = matches[0]!;
  const { data: roles } = await admin.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isDriver = (roles ?? []).some((r) => r.role === DRIVER_RIGGER_ROLE);
  if (!isDriver) {
    return {
      ok: false,
      message: "Iqama login is only for Driver/Rigger. Use your email address.",
      status: 401,
    };
  }

  const email = typeof employee.email === "string" ? employee.email : "";
  if (!isUsableLoginEmail(email)) {
    return {
      ok: false,
      message: "This Driver/Rigger login is not set up yet. Ask admin for your Iqama password.",
      status: 401,
    };
  }

  return { ok: true, email: email.trim().toLowerCase() };
}
