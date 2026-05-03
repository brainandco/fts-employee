import { getDataClient } from "@/lib/supabase/server";
import { browsePrefix } from "@/lib/employee-files/s3-browse";
import {
  buildEmployeeRootPrefix,
  buildRegionFilesPrefix,
  normalizeRelativePathUnderEmployee,
} from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

/** GET — PP browses all regions / employees (same shape as admin employee-files browse). */
export async function GET(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const regionId = String(url.searchParams.get("regionId") ?? "").trim();
  const employeeId = String(url.searchParams.get("employeeId") ?? "").trim();
  const rawPath = url.searchParams.get("path") ?? "";

  if (!regionId) {
    return NextResponse.json({ message: "regionId is required" }, { status: 400 });
  }

  const normalized =
    rawPath.trim() === "" ? "" : normalizeRelativePathUnderEmployee(rawPath);
  if (rawPath.trim() !== "" && !normalized) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: regionFolder, error: rfErr } = await supabase
    .from("employee_file_region_folders")
    .select("path_segment")
    .eq("region_id", regionId)
    .maybeSingle();

  if (rfErr || !regionFolder) {
    return NextResponse.json({ message: "Region folder not found for this region." }, { status: 400 });
  }

  const regionSeg = regionFolder.path_segment as string;
  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();

  if (!employeeId) {
    const searchPrefix = normalized
      ? `${buildRegionFilesPrefix(regionSeg)}${normalized}/`
      : buildRegionFilesPrefix(regionSeg);
    let entries;
    try {
      entries = await browsePrefix(s3, bucket, searchPrefix);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "List failed";
      return NextResponse.json({ message: msg }, { status: 500 });
    }

    const folders = entries.filter((e) => e.type === "folder").map((e) => ({
      type: "folder" as const,
      name: e.name,
      path: normalized ? `${normalized}/${e.name}` : e.name,
    }));

    const files = entries
      .filter((e) => e.type === "file")
      .map((e) => ({
        type: "file" as const,
        name: e.name,
        key: e.key,
        size: e.size,
        lastModified: e.lastModified,
        db: null as null,
      }));

    return NextResponse.json({
      mode: "region" as const,
      path: normalized,
      folders,
      files,
    });
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, region_id, status, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  if (empErr || !emp || emp.status !== "ACTIVE") {
    return NextResponse.json({ message: "Employee not found or inactive" }, { status: 400 });
  }
  if (emp.region_id !== regionId) {
    return NextResponse.json({ message: "Employee is not in the selected region" }, { status: 400 });
  }

  const root = buildEmployeeRootPrefix(regionSeg, emp.full_name ?? null, emp.id);
  const searchPrefix = normalized ? `${root}${normalized}/` : root;

  let entries;
  try {
    entries = await browsePrefix(s3, bucket, searchPrefix);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const fileKeys = entries
    .filter((e) => e.type === "file")
    .map((e) => (e as { type: "file"; key: string }).key);

  const rows: {
    id: string;
    file_name: string;
    mime_type: string | null;
    byte_size: number | null;
    upload_status: string;
    created_at: string;
    storage_key: string;
  }[] = [];
  const KEY_CHUNK = 80;
  for (let i = 0; i < fileKeys.length; i += KEY_CHUNK) {
    const slice = fileKeys.slice(i, i + KEY_CHUNK);
    const { data: chunk } = await supabase
      .from("employee_personal_files")
      .select("id, file_name, mime_type, byte_size, upload_status, created_at, storage_key")
      .eq("employee_id", emp.id)
      .in("storage_key", slice);
    rows.push(...(chunk ?? []));
  }

  const byKey = new Map(rows.map((r) => [r.storage_key as string, r]));

  const folders = entries.filter((e) => e.type === "folder").map((e) => ({
    type: "folder" as const,
    name: e.name,
    path: normalized ? `${normalized}/${e.name}` : e.name,
  }));

  const files = entries
    .filter((e) => e.type === "file")
    .map((e) => {
      const row = byKey.get(e.key);
      return {
        type: "file" as const,
        name: e.name,
        key: e.key,
        size: e.size,
        lastModified: e.lastModified,
        db: row
          ? {
              id: row.id,
              file_name: row.file_name,
              mime_type: row.mime_type,
              byte_size: row.byte_size,
              upload_status: row.upload_status,
              created_at: row.created_at,
            }
          : null,
      };
    });

  return NextResponse.json({
    mode: "employee" as const,
    employeeId: emp.id,
    path: normalized,
    rootPrefix: root,
    folders,
    files,
  });
}
