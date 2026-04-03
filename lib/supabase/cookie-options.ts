import { NextRequest } from "next/server";

export function getAuthCookieOptions(request: NextRequest) {
  const url = request.nextUrl ?? new URL(request.url);
  const isSecure = url.protocol === "https:";
  return {
    path: "/" as const,
    sameSite: "lax" as const,
    secure: isSecure,
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function mergeCookieOptions(
  request: NextRequest,
  options?: { path?: string; maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" }
) {
  const base = getAuthCookieOptions(request);
  return { ...base, ...options };
}
