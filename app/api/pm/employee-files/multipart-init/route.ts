import { randomUUID } from "crypto";
import { getDataClient } from "@/lib/supabase/server";
import {
  buildEmployeeFileStorageKey,
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import {
  assertPmRegion,
  pmRegionForbidden,
  requirePmEmployeeFilesAccess,
} from "@/lib/pm-files/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFileMaxBytes, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { multipartPartCount, multipartPartSizeBytesForFile, S3_SINGLE_PUT_MAX_BYTES } from "@/lib/wasabi/s3-multipart-constants";
import { multipartPartSignExpiresSec, s3AbortMultipartUpload, s3CreateMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

type Body = {
  regionId?: string;
  employeeId?: string;
  fileName?: string;
  contentType?: string | null;
  byteSize?: number | null;
  relativePath?: string | null;
  uploadDate?: string | null;
};

function parseUploadDate(iso: string | null | undefined): Date | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  const gate = await requirePmEmployeeFilesAccess();
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
  if (!assertPmRegion(regionId, gate.allowedRegionIds)) return pmRegionForbidden();

  const fileName = safeEmployeeFileName(String(body.fileName ?? ""));
  if (!fileName || !isAllowedEmployeeFileName(fileName)) {
    return NextResponse.json({ message: "Invalid or disallowed file name" }, { status: 400 });
  }

  const byteSize = typeof body.byteSize === "number" && Number.isFinite(body.byteSize) ? Math.floor(body.byteSize) : null;
  if (byteSize == null || byteSize <= S3_SINGLE_PUT_MAX_BYTES) {
    return NextResponse.json(
      { message: `Multipart is only for files larger than ${S3_SINGLE_PUT_MAX_BYTES} bytes` },
      { status: 400 }
    );
  }

  const maxB = getWasabiEmployeeFileMaxBytes();
  if (maxB > 0 && byteSize > maxB) {
    return NextResponse.json({ message: `File exceeds maximum size (${maxB} bytes)` }, { status: 400 });
  }

  const contentType = String(body.contentType ?? "application/octet-stream").trim() || "application/octet-stream";

  const relRaw = body.relativePath;
  const relativePath = relRaw != null && String(relRaw).trim() !== "" ? normalizeRelativePathUnderEmployee(String(relRaw)) : null;
  if (relRaw != null && String(relRaw).trim() !== "" && !relativePath) {
    return NextResponse.json({ message: "Invalid relativePath" }, { status: 400 });
  }

  const uploadDate = parseUploadDate(body.uploadDate ?? undefined);

  const supabase = await getDataClient();
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

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("id, path_segment")
    .eq("region_id", regionId)
    .maybeSingle();
  if (folderErr || !folder) {
    return NextResponse.json({ message: "Region storage is not set up for this region yet." }, { status: 400 });
  }

  const id = randomUUID();
  const storageKey = buildEmployeeFileStorageKey(folder.path_segment, emp.full_name ?? null, emp.id, id, fileName, {
    relativePath,
    uploadDate,
  });

  const partSizeBytes = multipartPartSizeBytesForFile(byteSize);
  const partCount = multipartPartCount(byteSize, partSizeBytes);

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiEmployeeFilesBucket();

  let uploadId: string;
  try {
    uploadId = await s3CreateMultipartUpload(s3, bucket, storageKey, contentType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Multipart init failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const { error: insErr } = await supabase.from("employee_personal_files").insert({
    id,
    employee_id: emp.id,
    region_id: regionId,
    folder_id: folder.id,
    storage_key: storageKey,
    file_name: fileName,
    mime_type: contentType,
    upload_status: "pending",
    multipart_upload_id: uploadId,
  });

  if (insErr) {
    try {
      await s3AbortMultipartUpload(s3, bucket, storageKey, uploadId);
    } catch {
      /* best effort */
    }
    return NextResponse.json({ message: insErr.message }, { status: 400 });
  }

  return NextResponse.json({
    id,
    uploadId,
    storageKey,
    partSizeBytes,
    partCount,
    expiresIn: multipartPartSignExpiresSec(),
  });
}
