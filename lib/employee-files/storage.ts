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
]);

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

export function isAllowedEmployeeFileName(fileName: string): boolean {
  const base = (fileName || "").split(/[\\/]/).pop() ?? "";
  const m = base.match(/\.([a-z0-9]+)$/i);
  if (!m) return false;
  return ALLOWED_EXT.has(m[1].toLowerCase());
}

export function buildEmployeeFileStorageKey(
  pathSegment: string,
  employeeId: string,
  fileId: string,
  originalName: string
): string {
  const keyPrefix = getWasabiEmployeeFilesKeyPrefix();
  return `${keyPrefix}/${pathSegment}/employees/${employeeId}/${fileId}/${safeEmployeeFileName(originalName)}`;
}
