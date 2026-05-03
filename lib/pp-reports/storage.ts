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

/**
 * PP reports keys include `reporterFolderSlug` first (same idea as employee field folders).
 * `pathUnderReporter` is what the UI browses (project folders, etc.), never the slug alone from the client.
 */
export function scopeReporterRelativePath(reporterSlug: string, pathUnderReporter: string): string | null {
  const slugNorm = normalizeRelativePathUnderEmployee(reporterSlug);
  if (!slugNorm) return null;
  const under = pathUnderReporter.trim();
  if (!under) return slugNorm;
  const rest = normalizeRelativePathUnderEmployee(under);
  if (!rest) return null;
  return `${slugNorm}/${rest}`;
}

/** List/delete prefix: `{optional env base}/{slug}/{pathUnderReporter}/` */
export function ppReportsListPrefixForReporter(reporterSlug: string, pathUnderReporter: string): string | null {
  const scoped = scopeReporterRelativePath(reporterSlug, pathUnderReporter);
  if (!scoped) return null;
  const base = ppReportsKeyPrefixBase();
  return `${base ? `${base}/` : ""}${scoped}/`;
}

export function reporterPpReportsObjectKeyPrefix(reporterSlug: string): string | null {
  const scoped = scopeReporterRelativePath(reporterSlug, "");
  if (!scoped) return null;
  const base = ppReportsKeyPrefixBase();
  return base ? `${base}/${scoped}/` : `${scoped}/`;
}

export function isKeyOwnedByReporter(key: string, reporterSlug: string): boolean {
  if (!key || key.includes("..")) return false;
  if (!isKeyUnderPpReportsPrefix(key)) return false;
  const prefix = reporterPpReportsObjectKeyPrefix(reporterSlug);
  if (!prefix) return false;
  return key.startsWith(prefix);
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
