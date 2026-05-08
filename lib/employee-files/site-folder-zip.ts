import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Archiver } from "archiver";
import archiver from "archiver";
import { Readable } from "node:stream";
import { getDataClient } from "@/lib/supabase/server";
import { listAllObjectKeysUnderPrefix } from "@/lib/employee-files/s3-browse";
import {
  buildEmployeeRootPrefix,
  normalizeRelativePathUnderEmployee,
} from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";

export const MAX_OBJECTS_IN_ZIP = 2_000;
/** Cap for POST /site-folder-zip-multi: folder paths after deduplication. */
export const MAX_FOLDERS_PER_MULTI_ZIP = 35;
/** Hard cap on total S3 objects appended across all folders in one multi-zip. */
export const MAX_OBJECTS_MULTI_ZIP_TOTAL = 12_000;

export type ResolvedSiteZip =
  | {
      ok: true;
      rootPrefix: string;
      sitePrefix: string;
      archiveFolderName: string;
      normalizedSitePath: string;
    }
  | { ok: false; status: number; message: string };

export async function resolveSiteFolderZipContext(
  regionId: string,
  employeeId: string,
  sitePathRaw: string
): Promise<ResolvedSiteZip> {
  const normalized = normalizeRelativePathUnderEmployee(sitePathRaw.trim());
  if (!normalized) {
    return { ok: false, status: 400, message: "Invalid site path" };
  }

  const supabase = await getDataClient();
  const { data: regionFolder, error: rfErr } = await supabase
    .from("employee_file_region_folders")
    .select("path_segment")
    .eq("region_id", regionId)
    .maybeSingle();

  if (rfErr || !regionFolder) {
    return { ok: false, status: 400, message: "Region folder not found for this region." };
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, region_id, status, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp || emp.status !== "ACTIVE") {
    return { ok: false, status: 400, message: "Employee not found or inactive" };
  }
  if (emp.region_id !== regionId) {
    return { ok: false, status: 400, message: "Employee is not in the selected region" };
  }

  const regionSeg = regionFolder.path_segment as string;
  const root = buildEmployeeRootPrefix(regionSeg, emp.full_name ?? null, emp.id);
  const sitePrefix = `${root}${normalized}/`;
  const parts = normalized.split("/").filter(Boolean);
  const archiveFolderName = parts[parts.length - 1] ?? "site";

  return {
    ok: true,
    rootPrefix: root,
    sitePrefix,
    archiveFolderName,
    normalizedSitePath: normalized,
  };
}

/**
 * If both `Apr-2026` and `Apr-2026/day` are selected, keep only the ancestor so objects are not duplicated in the zip.
 */
export function dedupeAncestorFolderPaths(pathsRaw: string[]): string[] {
  const normalized = [...new Set(pathsRaw.map((p) => normalizeRelativePathUnderEmployee(String(p ?? "").trim())).filter(Boolean))] as string[];
  normalized.sort((a, b) => a.length - b.length);
  const out: string[] = [];
  for (const p of normalized) {
    if (out.some((o) => p === o || p.startsWith(`${o}/`))) continue;
    out.push(p);
  }
  return out;
}

export type MultiZipFolderEntry = {
  normalizedSitePath: string;
  sitePrefix: string;
  zipRootFolderName: string;
};

export async function resolveMultiSiteFolderZipContexts(
  regionId: string,
  employeeId: string,
  pathsRaw: string[]
): Promise<{ ok: true; folders: MultiZipFolderEntry[] } | { ok: false; status: number; message: string }> {
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
  const folders: MultiZipFolderEntry[] = [];
  for (const segment of deduped) {
    const r = await resolveSiteFolderZipContext(regionId, employeeId, segment);
    if (!r.ok) return { ok: false, status: r.status, message: r.message };
    folders.push({
      normalizedSitePath: r.normalizedSitePath,
      sitePrefix: r.sitePrefix,
      zipRootFolderName: r.normalizedSitePath.replace(/\\/g, "/"),
    });
  }
  return { ok: true, folders };
}

export async function appendSiteFolderObjectsToArchive(
  s3: S3Client,
  bucket: string,
  sitePrefix: string,
  zipRootFolderName: string,
  archive: Archiver,
  options?: { maxObjects?: number }
): Promise<{ objectCount: number; truncated: boolean }> {
  const p = sitePrefix.replace(/\/*$/, "/");
  const maxObj = typeof options?.maxObjects === "number" && options.maxObjects > 0 ? options.maxObjects : MAX_OBJECTS_IN_ZIP;
  const { keys, truncated } = await listAllObjectKeysUnderPrefix(s3, bucket, p, maxObj);
  let objectCount = 0;
  for (const key of keys) {
    if (key.endsWith("/.keep")) continue;
    const rel = key.slice(p.length);
    if (!rel || rel.includes("..")) continue;
    const entryName = `${zipRootFolderName}/${rel}`.replace(/\\/g, "/");
    const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = resp.Body;
    if (!body) continue;
    archive.append(body as Readable, { name: entryName });
    objectCount++;
  }
  return { objectCount, truncated };
}

export function createZipArchiver(): Archiver {
  return archiver("zip", { zlib: { level: 5 } });
}

export function getS3ForSiteZip() {
  return {
    s3: getWasabiEmployeeFilesS3Client(),
    bucket: getWasabiEmployeeFilesBucket(),
  };
}
