/** First-login / forced password change flow (see migration must_change_password). */

export const CHANGE_PASSWORD_PATH = "/settings/change-password";

export function isPasswordChangeExemptPath(pathname: string): boolean {
  const p = (pathname.split("?")[0] ?? "").trim() || "/";
  return p === CHANGE_PASSWORD_PATH || p.startsWith(`${CHANGE_PASSWORD_PATH}/`);
}
