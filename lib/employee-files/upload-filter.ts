import { isAllowedEmployeeFileName } from "@/lib/employee-files/storage";

export type SkippedUpload = { name: string; reason: string };

/** Split files before calling presign-batch: empty and unsupported types are skipped so one bad file cannot fail the whole batch. */
export function filterEmployeeUploadItems<T extends { file: File }>(items: T[]): {
  allowed: T[];
  skipped: SkippedUpload[];
} {
  const skipped: SkippedUpload[] = [];
  const allowed: T[] = [];
  for (const it of items) {
    const n = it.file.name;
    if (!it.file.size) {
      skipped.push({ name: n, reason: "Empty file (0 bytes)" });
      continue;
    }
    if (!isAllowedEmployeeFileName(n)) {
      const base = n.split(/[\\/]/).pop() ?? "";
      const hasExt = /\.[a-zA-Z0-9]+$/.test(base);
      skipped.push({
        name: n,
        reason: hasExt
          ? "Extension is not allowed for My files"
          : "No extension — add a supported type (e.g. .pdf, .zip)",
      });
      continue;
    }
    allowed.push(it);
  }
  return { allowed, skipped };
}
