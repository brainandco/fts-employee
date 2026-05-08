import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import {
  dedupeAncestorFolderPaths,
  MAX_FOLDERS_PER_MULTI_ZIP,
} from "@/lib/employee-files/site-folder-zip";
import { ppReportsKeyPrefixBase, ppReportsListPrefixForReporter } from "@/lib/pp-reports/storage";
import { getWasabiPpReportsBucket, getWasabiPpReportsS3Client } from "@/lib/wasabi/s3-client";

export type ResolvedPpReportsZipFolder = {
  s3Prefix: string;
  zipRootFolderName: string;
};

export function resolvePpReporterFolderZip(
  reporterSlug: string,
  folderPathRaw: string
): { ok: true; folder: ResolvedPpReportsZipFolder } | { ok: false; status: number; message: string } {
  const normalized = normalizeRelativePathUnderEmployee(folderPathRaw.trim());
  if (!normalized) {
    return { ok: false, status: 400, message: "Invalid folder path" };
  }
  const listPrefix = ppReportsListPrefixForReporter(reporterSlug, normalized);
  if (!listPrefix) {
    return { ok: false, status: 400, message: "Invalid folder path" };
  }
  return {
    ok: true,
    folder: {
      s3Prefix: listPrefix,
      zipRootFolderName: normalized.replace(/\\/g, "/"),
    },
  };
}

export function resolvePmPpReportsFolderZip(
  folderPathRaw: string
): { ok: true; folder: ResolvedPpReportsZipFolder } | { ok: false; status: number; message: string } {
  const normalized = normalizeRelativePathUnderEmployee(folderPathRaw.trim());
  if (!normalized) {
    return { ok: false, status: 400, message: "Invalid folder path" };
  }
  const base = ppReportsKeyPrefixBase();
  const s3Prefix = `${base ? `${base}/` : ""}${normalized}/`;
  return {
    ok: true,
    folder: {
      s3Prefix,
      zipRootFolderName: normalized.replace(/\\/g, "/"),
    },
  };
}

export function resolveMultiPpReporterFolders(
  reporterSlug: string,
  pathsRaw: string[]
): { ok: true; folders: ResolvedPpReportsZipFolder[] } | { ok: false; status: number; message: string } {
  const deduped = dedupeAncestorFolderPaths(pathsRaw);
  if (deduped.length === 0) {
    return { ok: false, status: 400, message: "No valid folder paths." };
  }
  if (deduped.length > MAX_FOLDERS_PER_MULTI_ZIP) {
    return {
      ok: false,
      status: 400,
      message: `At most ${MAX_FOLDERS_PER_MULTI_ZIP} folders per multi-download (after removing nested duplicates).`,
    };
  }
  const folders: ResolvedPpReportsZipFolder[] = [];
  for (const p of deduped) {
    const r = resolvePpReporterFolderZip(reporterSlug, p);
    if (!r.ok) return { ok: false, status: r.status, message: r.message };
    folders.push(r.folder);
  }
  return { ok: true, folders };
}

export function resolveMultiPmPpReportsFolders(
  pathsRaw: string[]
): { ok: true; folders: ResolvedPpReportsZipFolder[] } | { ok: false; status: number; message: string } {
  const deduped = dedupeAncestorFolderPaths(pathsRaw);
  if (deduped.length === 0) {
    return { ok: false, status: 400, message: "No valid folder paths." };
  }
  if (deduped.length > MAX_FOLDERS_PER_MULTI_ZIP) {
    return {
      ok: false,
      status: 400,
      message: `At most ${MAX_FOLDERS_PER_MULTI_ZIP} folders per multi-download (after removing nested duplicates).`,
    };
  }
  const folders: ResolvedPpReportsZipFolder[] = [];
  for (const p of deduped) {
    const r = resolvePmPpReportsFolderZip(p);
    if (!r.ok) return { ok: false, status: r.status, message: r.message };
    folders.push(r.folder);
  }
  return { ok: true, folders };
}

export function getS3ForPpReportsZip() {
  return {
    s3: getWasabiPpReportsS3Client(),
    bucket: getWasabiPpReportsBucket()!,
  };
}
