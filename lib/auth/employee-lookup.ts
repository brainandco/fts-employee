import type { SupabaseClient } from "@supabase/supabase-js";

export type PortalEmployeeRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  region_id: string | null;
  avatar_url: string | null;
  must_change_password: boolean | null;
};

const EMPLOYEE_COLS =
  "id, email, full_name, status, region_id, avatar_url, must_change_password";

/** Normalize login email the same way Supabase Auth stores it. */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Find employee by auth email (case-insensitive). Exact `.eq` fails when
 * `employees.email` was saved with different casing than the auth user.
 */
export async function findEmployeeByLoginEmail(
  client: SupabaseClient,
  authEmail: string
): Promise<PortalEmployeeRow | null> {
  const raw = authEmail.trim();
  const normalized = normalizeLoginEmail(authEmail);
  if (!normalized) return null;

  const { data: lowerHit } = await client
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("email", normalized)
    .maybeSingle();
  if (lowerHit) return lowerHit as PortalEmployeeRow;

  if (raw !== normalized) {
    const { data: rawHit } = await client
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("email", raw)
      .maybeSingle();
    if (rawHit) return rawHit as PortalEmployeeRow;
  }

  const { data: ilikeRows } = await client
    .from("employees")
    .select(EMPLOYEE_COLS)
    .ilike("email", raw)
    .limit(20);

  const hit = (ilikeRows ?? []).find(
    (r) => normalizeLoginEmail(String((r as PortalEmployeeRow).email ?? "")) === normalized
  );
  return (hit as PortalEmployeeRow | undefined) ?? null;
}

/** If DB email casing differs from auth, store lowercase so future queries match. */
export async function syncEmployeeEmailToAuthIfNeeded(
  client: SupabaseClient,
  employee: PortalEmployeeRow,
  authEmail: string
): Promise<void> {
  const normalized = normalizeLoginEmail(authEmail);
  const current = normalizeLoginEmail(employee.email ?? "");
  if (!normalized || current === normalized) return;
  await client.from("employees").update({ email: normalized }).eq("id", employee.id);
}
