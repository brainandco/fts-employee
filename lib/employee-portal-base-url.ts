const CANONICAL_EMPLOYEE_PORTAL = "https://employee.fts-ksa.com";

function withScheme(url: string): string {
  let raw = url.trim().replace(/\/$/, "");
  if (!raw) return raw;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw.replace(/\/$/, "");
}

/** Public employee portal origin (no trailing slash). */
export function getEmployeePortalBaseUrl(): string {
  const override = (process.env.EMPLOYEE_PORTAL_PUBLIC_URL || process.env.NEXT_PUBLIC_EMPLOYEE_APP_URL || "")
    .trim();
  if (override) return withScheme(override);
  if (process.env.NODE_ENV === "production") return CANONICAL_EMPLOYEE_PORTAL;
  return withScheme(process.env.EMPLOYEE_PORTAL_URL || "http://localhost:3001");
}
