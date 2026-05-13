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

function uuidToBytes(uuid: string): Buffer | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

function bytesToUuid(b: Buffer): string | null {
  if (b.length !== 16) return null;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function writeUInt48BE(buf: Buffer, offset: number, n: number) {
  const n48 = Math.floor(Math.min(n, 0xffff_ffff_ffff));
  const lo = n48 >>> 0;
  const hi = Math.floor(n48 / 0x1_0000_0000);
  buf.writeUInt16BE(hi & 0xffff, offset);
  buf.writeUInt32BE(lo, offset + 2);
}

function readUInt48BE(buf: Buffer, offset: number): number {
  const hi = buf.readUInt16BE(offset);
  const lo = buf.readUInt32BE(offset + 2);
  return hi * 0x1_0000_0000 + lo;
}

const MAX_PATH_BYTES = 4096;

/** Last path segment — used in public download URLs (must match signed path). */
export function folderLabelFromNormalizedSitePath(normalizedSitePath: string): string {
  const parts = normalizedSitePath.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : "site";
}

function mintV2Compact(secret: string, p: SiteZipTokenPayload): string | null {
  const ridB = uuidToBytes(p.rid);
  const eidB = uuidToBytes(p.eid);
  if (!ridB || !eidB) return null;
  const pathBuf = Buffer.from(p.path, "utf8");
  if (pathBuf.length > MAX_PATH_BYTES) return null;
  const bodyLen = 1 + 6 + 16 + 16 + 2 + pathBuf.length;
  const body = Buffer.allocUnsafe(bodyLen);
  let o = 0;
  body[o++] = 2;
  writeUInt48BE(body, o, Math.floor(p.exp));
  o += 6;
  ridB.copy(body, o);
  o += 16;
  eidB.copy(body, o);
  o += 16;
  body.writeUInt16BE(pathBuf.length, o);
  o += 2;
  pathBuf.copy(body, o);
  o += pathBuf.length;
  const sig = createHmac("sha256", secret).update(body).digest();
  return Buffer.concat([body, sig]).toString("base64url");
}

function parseV2Compact(secret: string, token: string): SiteZipTokenPayload | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(token, "base64url");
  } catch {
    return null;
  }
  const minLen = 1 + 6 + 16 + 16 + 2 + 32;
  if (buf.length < minLen) return null;
  const sigOff = buf.length - 32;
  const body = buf.subarray(0, sigOff);
  const sig = buf.subarray(sigOff);
  const expected = createHmac("sha256", secret).update(body).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  let o = 0;
  if (body[o++] !== 2) return null;
  const exp = readUInt48BE(body, o);
  o += 6;
  const rid = bytesToUuid(body.subarray(o, o + 16));
  o += 16;
  const eid = bytesToUuid(body.subarray(o, o + 16));
  o += 16;
  const plen = body.readUInt16BE(o);
  o += 2;
  if (body.length !== o + plen || plen > MAX_PATH_BYTES) return null;
  const path = body.subarray(o, o + plen).toString("utf8");
  if (exp < Date.now()) return null;
  if (!rid || !eid || !path) return null;
  return { v: 1, rid, eid, path, exp };
}

function parseV1Legacy(secret: string, token: string): SiteZipTokenPayload | null {
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

/** New links: compact binary token (shorter than legacy JSON token). */
export function mintSiteZipToken(payload: SiteZipTokenPayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return mintV2Compact(secret, payload);
}

/** Accepts legacy `?t=body.sig` tokens and compact v2 tokens (`?c=`). */
export function parseSiteZipToken(token: string): SiteZipTokenPayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(".");
  if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
    const legacy = parseV1Legacy(secret, trimmed);
    if (legacy) return legacy;
  }
  return parseV2Compact(secret, trimmed);
}
