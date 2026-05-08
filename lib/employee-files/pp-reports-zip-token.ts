import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed folder-zip link payload for PP final reports bucket (not employee site folders). */
export type PpReportsZipTokenPayload =
  | { v: 1; scope: "bucket"; path: string; exp: number }
  | { v: 1; scope: "reporter"; slug: string; path: string; exp: number };

function getSecret(): string | null {
  const primary = process.env.PP_REPORTS_ZIP_LINK_SECRET?.trim();
  if (primary && primary.length >= 16) return primary;
  const fallback = process.env.EMPLOYEE_FILES_SITE_ZIP_LINK_SECRET?.trim();
  return fallback && fallback.length >= 16 ? fallback : null;
}

export function ppReportsZipLinkSecretConfigured(): boolean {
  return getSecret() != null;
}

export function mintPpReportsZipToken(payload: PpReportsZipTokenPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", secret).update(body).digest();
  return `${body.toString("base64url")}.${sig.toString("base64url")}`;
}

export function parsePpReportsZipToken(token: string): PpReportsZipTokenPayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;
  if (!bodyB64 || !sigB64) return null;
  let body: Buffer;
  let sig: Buffer;
  try {
    body = Buffer.from(bodyB64, "base64url");
    sig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret).update(body).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (p.v !== 1 || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    if (p.scope === "bucket" && typeof p.path === "string") {
      return { v: 1, scope: "bucket", path: p.path, exp: p.exp };
    }
    if (p.scope === "reporter" && typeof p.slug === "string" && typeof p.path === "string") {
      return { v: 1, scope: "reporter", slug: p.slug, path: p.path, exp: p.exp };
    }
    return null;
  } catch {
    return null;
  }
}
