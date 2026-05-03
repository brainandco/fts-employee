import { randomUUID } from "crypto";
import {
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import { getWasabiPpReportsKeyPrefix } from "@/lib/wasabi/s3-client";

/** Absolute key prefix inside the PP reports bucket (may be empty). */
export function ppReportsKeyPrefixBase(): string {
  const p = getWasabiPpReportsKeyPrefix();
  if (!p) return "";
  return p.replace(/^\/+|\/+$/g, "");
}

export function buildPpReportObjectKey(relativePathUnderBucket: string | null | undefined, originalFileName: string): string {
  const safe = safeEmployeeFileName(originalFileName);
  if (!isAllowedEmployeeFileName(safe)) {
    throw new Error("File type not allowed");
  }
  const short = randomUUID().replace(/-/g, "").slice(0, 8);
  const base = ppReportsKeyPrefixBase();
  const prefix = base ? `${base}/` : "";
  const raw = relativePathUnderBucket?.trim();
  const rel = raw ? normalizeRelativePathUnderEmployee(raw) : null;
  if (raw && !rel) throw new Error("Invalid path");
  const tail = rel ? `${rel}/${short}-${safe}` : `${short}-${safe}`;
  return `${prefix}${tail}`;
}

export function isKeyUnderPpReportsPrefix(key: string): boolean {
  if (!key || key.includes("..")) return false;
  const base = ppReportsKeyPrefixBase();
  if (!base) return true;
  return key.startsWith(`${base}/`) || key === base;
}
