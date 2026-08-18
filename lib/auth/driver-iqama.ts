export const DRIVER_RIGGER_ROLE = "Driver/Rigger";

export function normalizeIqama(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Iqama-style identifier (digits only, not an email). */
export function looksLikeIqamaIdentifier(raw: string): boolean {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.includes("@")) return false;
  return /^\d{8,15}$/.test(normalizeIqama(trimmed));
}

export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isUsableLoginEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || e === "n/a" || e === "na" || e === "-" || e === "none" || e === "null") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function syntheticDriverEmail(iqama: string): string {
  return `${normalizeIqama(iqama)}@driver.fts-ksa.com`;
}

export function driverPortalEmail(iqama: string, existingEmail: string | null | undefined): string {
  if (isUsableLoginEmail(existingEmail)) return (existingEmail ?? "").trim().toLowerCase();
  return syntheticDriverEmail(iqama);
}
