import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDataClient } from "@/lib/supabase/server";
import {
  buildEmployeeFileStorageKey,
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFileMaxBytes, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const PRESIGN_EXPIRES_SEC = 3600;
const MAX_ITEMS = 100;

type ItemIn = {
  fileName?: string;
  contentType?: string | null;
  byteSize?: number | null;
  relativePath?: string | null;
};

type Body = {
  regionId?: string;
  employeeId?: string;
  items?: ItemIn[];
  relativePath?: string | null;
  uploadDate?: string | null;
};

function parseUploadDate(iso: string | null | undefined): Date | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const regionId = String(body.regionId ?? "").trim();
  const employeeId = String(body.employeeId ?? "").trim();
  if (!regionId || !employeeId) {
    return NextResponse.json({ message: "regionId and employeeId are required" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ message: "items must be a non-empty array" }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ message: `At most ${MAX_ITEMS} files per batch` }, { status: 400 });
  }

  const relRaw = body.relativePath;
  const relativePath = relRaw != null && String(relRaw).trim() !== "" ? normalizeRelativePathUnderEmployee(String(relRaw)) : null;
  if (relRaw != null && String(relRaw).trim() !== "" && !relativePath) {
    return NextResponse.json({ message: "Invalid relativePath" }, { status: 400 });
  }

  const uploadDate = parseUploadDate(body.uploadDate ?? undefined);
  const maxB = getWasabiEmployeeFileMaxBytes();

  const supabase = await getDataClient();
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("id, region_id, status, full_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (empErr || !emp || emp.status !== "ACTIVE") {
    return NextResponse.json({ message: "Employee not found or inactive" }, { status: 400 });
  }

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("id, path_segment")
    .eq("region_id", regionId)
    .maybeSingle();
  if (folderErr || !folder) {
    return NextResponse.json({ message: "Create a region folder before uploading" }, { status: 400 });
  }

  type Prepared = {
    index: number;
    fileName: string;
    contentType: string;
    byteSize: number | null;
    id: string;
    storageKey: string;
  };

  const prepared: Prepared[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i]!;
    const fileName = safeEmployeeFileName(String(it.fileName ?? ""));
    if (!isAllowedEmployeeFileName(fileName)) {
      return NextResponse.json({ message: `Row ${i + 1}: file type not allowed (${fileName}).` }, { status: 400 });
    }
    const contentType = String(it.contentType ?? "application/octet-stream").trim() || "application/octet-stream";
    const byteSize = typeof it.byteSize === "number" && Number.isFinite(it.byteSize) ? Math.floor(it.byteSize) : null;
    if (byteSize != null && byteSize > maxB) {
      return NextResponse.json({ message: `Row ${i + 1}: exceeds maximum size (${maxB} bytes)` }, { status: 400 });
    }
    const itemRelRaw = it.relativePath;
    const itemRel =
      itemRelRaw != null && String(itemRelRaw).trim() !== ""
        ? normalizeRelativePathUnderEmployee(String(itemRelRaw))
        : null;
    if (itemRelRaw != null && String(itemRelRaw).trim() !== "" && !itemRel) {
      return NextResponse.json({ message: `Row ${i + 1}: invalid relativePath` }, { status: 400 });
    }
    const effectiveRel = itemRel ?? relativePath;
    const id = randomUUID();
    const storageKey = buildEmployeeFileStorageKey(folder.path_segment, emp.full_name ?? null, emp.id, id, fileName, {
      relativePath: effectiveRel,
      uploadDate,
    });
    prepared.push({ index: i, fileName, contentType, byteSize, id, storageKey });
  }

  const insertRows = prepared.map((p) => ({
    id: p.id,
    employee_id: emp.id,
    region_id: regionId,
    folder_id: folder.id,
    storage_key: p.storageKey,
    file_name: p.fileName,
    mime_type: p.contentType,
    upload_status: "pending" as const,
  }));

  const { error: insErr } = await supabase.from("employee_personal_files").insert(insertRows);
  if (insErr) {
    return NextResponse.json({ message: insErr.message }, { status: 400 });
  }

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();

  try {
    const uploads = await Promise.all(
      prepared.map(async (p) => {
        const cmd = new PutObjectCommand({
          Bucket: bucket,
          Key: p.storageKey,
          ContentType: p.contentType,
        });
        const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
        return {
          index: p.index,
          id: p.id,
          uploadUrl,
          storageKey: p.storageKey,
          fileName: p.fileName,
          headers: { "Content-Type": p.contentType },
          expiresIn: PRESIGN_EXPIRES_SEC,
        };
      })
    );
    return NextResponse.json({ uploads });
  } catch (e) {
    const ids = prepared.map((p) => p.id);
    await supabase.from("employee_personal_files").delete().in("id", ids);
    const msg = e instanceof Error ? e.message : "Presign batch failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
