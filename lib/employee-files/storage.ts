import { getWasabiEmployeeFilesKeyPrefix } from "@/lib/wasabi/s3-client";

const ALLOWED_EXT = new Set([
  "pdf",
  "txt",
  "csv",
  "xls",
  "xlsx",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "rtf",
  "zip",
  "rar",
  "7z",
]);

/** Short list for UI copy (must match ALLOWED_EXT). */
export const EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP =
  "pdf, txt, csv, xls, xlsx, doc, docx, ppt, pptx, odt, ods, rtf, zip, rar, 7z";

export function safeEmployeeFileName(name: string): string {
  const n = (name || "file").trim().replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_");
  return n.slice(0, 200) || "file.bin";
}

export function slugifyRegionPathSegment(s: string): string {
  const t = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return t || "region";
}

/** Stable folder name under region: employee display name + short id (Wasabi path segment). */
export function employeeNameFolderSlug(fullName: string | null, employeeId: string): string {
  const namePart = slugifyRegionPathSegment((fullName ?? "employee").trim()) || "employee";
  const idShort = employeeId.replace(/-/g, "").slice(0, 8);
  return `${namePart}-${idShort}`;
}

/** e.g. Apr-2026 */
export function formatMonthYearFolder(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  const y = d.getFullYear();
  return `${m}-${y}`;
}

/** e.g. 28-Apr-2026 — day folder inside month-year */
export function formatDayMonthYearFolder(d: Date): string {
  const day = d.getDate();
  const m = d.toLocaleString("en-US", { month: "short" });
  const y = d.getFullYear();
  return `${day}-${m}-${y}`;
}

/**
 * Relative path under employee root (no leading/trailing slashes).
 * Rejects ".." and empty segments.
 */
export function normalizeRelativePathUnderEmployee(input: string | null | undefined): string | null {
  if (input == null || typeof input !== "string") return null;
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return null;
  const parts = trimmed.split("/").filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p === ".." || p === ".") return null;
    const s = p.trim().slice(0, 180);
    if (!s) return null;
    out.push(s.replace(/[^\w.\-()+ @&$=!*,?:;/]/g, "_"));
  }
  return out.join("/");
}

export function buildEmployeeRootPrefix(regionSegment: string, fullName: string | null, employeeId: string): string {
  const keyPrefix = getWasabiEmployeeFilesKeyPrefix();
  const emp = employeeNameFolderSlug(fullName, employeeId);
  return `${keyPrefix}/${regionSegment}/${emp}/`;
}

export type BuildEmployeeKeyOptions = {
  /** If set, file is stored under this path below the employee folder (no default month/day). */
  relativePath?: string | null;
  /** Used when relativePath is omitted; defaults to now. */
  uploadDate?: Date;
};

export function buildEmployeeFileStorageKey(
  regionSegment: string,
  fullName: string | null,
  employeeId: string,
  fileId: string,
  originalName: string,
  options?: BuildEmployeeKeyOptions
): string {
  const keyPrefix = getWasabiEmployeeFilesKeyPrefix();
  const emp = employeeNameFolderSlug(fullName, employeeId);
  const safe = safeEmployeeFileName(originalName);
  const shortId = fileId.replace(/-/g, "").slice(0, 8);
  const objectName = `${shortId}-${safe}`;

  const rel = normalizeRelativePathUnderEmployee(options?.relativePath ?? null);
  let tail: string;
  if (rel) {
    tail = `${rel}/${objectName}`;
  } else {
    const d = options?.uploadDate ?? new Date();
    const my = formatMonthYearFolder(d);
    const dy = formatDayMonthYearFolder(d);
    tail = `${my}/${dy}/${objectName}`;
  }

  return `${keyPrefix}/${regionSegment}/${emp}/${tail}`;
}

export function isAllowedEmployeeFileName(fileName: string): boolean {
  const base = (fileName || "").split(/[\\/]/).pop() ?? "";
  const m = base.match(/\.([a-zA-Z0-9]+)$/);
  if (!m) return false;
  return ALLOWED_EXT.has(m[1].toLowerCase());
}
