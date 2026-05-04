import { createHmac, timingSafeEqual } from "node:crypto";

export type SiteZipTokenPayload = {
  v: 1;
  rid: string;
  eid: string;
  path: string;
  exp: number;
};

function getSecret(): string | null {
  const s = process.env.EMPLOYEE_FILES_SITE_ZIP_LINK_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

export function siteZipLinkSecretConfigured(): boolean {
  return getSecret() != null;
}

export function mintSiteZipToken(payload: SiteZipTokenPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", secret).update(body).digest();
  return `${body.toString("base64url")}.${sig.toString("base64url")}`;
}

export function parseSiteZipToken(token: string): SiteZipTokenPayload | null {
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
    const p = JSON.parse(body.toString("utf8")) as SiteZipTokenPayload;
    if (p.v !== 1 || typeof p.rid !== "string" || typeof p.eid !== "string" || typeof p.path !== "string" || typeof p.exp !== "number") {
      return null;
    }
    if (p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
