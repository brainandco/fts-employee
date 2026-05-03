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

type Body = {
  regionId?: string;
  employeeId?: string;
  fileName?: string;
  contentType?: string;
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

  const fileName = safeEmployeeFileName(String(body.fileName ?? ""));
  if (!isAllowedEmployeeFileName(fileName)) {
    return NextResponse.json(
      {
        message:
          "File type not allowed. Use office, data, image, or archive types (e.g. pdf, docx, xlsx, png, jpg, webp, svg, zip, rar).",
      },
      { status: 400 }
    );
  }
  const contentType = String(body.contentType ?? "application/octet-stream").trim() || "application/octet-stream";
  const byteSize = typeof body.byteSize === "number" && Number.isFinite(body.byteSize) ? Math.floor(body.byteSize) : null;
  const maxB = getWasabiEmployeeFileMaxBytes();
  if (byteSize != null && byteSize > maxB) {
    return NextResponse.json({ message: `File exceeds maximum size (${maxB} bytes)` }, { status: 400 });
  }

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

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("id, path_segment")
    .eq("region_id", regionId)
    .maybeSingle();
  if (folderErr || !folder) {
    return NextResponse.json({ message: "Create a region folder before uploading" }, { status: 400 });
  }

  const fileId = randomUUID();
  const storageKey = buildEmployeeFileStorageKey(folder.path_segment, emp.full_name ?? null, emp.id, fileId, fileName, {
    relativePath,
    uploadDate,
  });

  const { error: insErr } = await supabase.from("employee_personal_files").insert({
    id: fileId,
    employee_id: emp.id,
    region_id: regionId,
    folder_id: folder.id,
    storage_key: storageKey,
    file_name: fileName,
    mime_type: contentType,
    upload_status: "pending",
  });
  if (insErr) {
    return NextResponse.json({ message: insErr.message }, { status: 400 });
  }

  try {
    const s3 = getWasabiEmployeeFilesS3Client();
    const bucket = getWasabiEmployeeFilesBucket();
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
    return NextResponse.json({
      id: fileId,
      uploadUrl,
      storageKey,
      expiresIn: PRESIGN_EXPIRES_SEC,
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    await supabase.from("employee_personal_files").delete().eq("id", fileId);
    const msg = e instanceof Error ? e.message : "Upload URL failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
