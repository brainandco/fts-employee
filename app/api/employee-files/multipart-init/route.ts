import { randomUUID } from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import {
  buildEmployeeFileStorageKey,
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFileMaxBytes, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import {
  multipartPartCount,
  multipartPartSizeBytesForFile,
  MULTIPART_UPLOAD_THRESHOLD_BYTES,
} from "@/lib/wasabi/s3-multipart-constants";
import { multipartPartSignExpiresSec, s3AbortMultipartUpload, s3CreateMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

type Body = {
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
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const fileName = safeEmployeeFileName(String(body.fileName ?? ""));
  if (!fileName || !isAllowedEmployeeFileName(fileName)) {
    return NextResponse.json({ message: "Invalid or disallowed file name" }, { status: 400 });
  }

  const byteSize = typeof body.byteSize === "number" && Number.isFinite(body.byteSize) ? Math.floor(body.byteSize) : null;
  if (byteSize == null || byteSize <= MULTIPART_UPLOAD_THRESHOLD_BYTES) {
    return NextResponse.json(
      { message: `Multipart is only for files larger than ${MULTIPART_UPLOAD_THRESHOLD_BYTES} bytes` },
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
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase
    .from("employees")
    .select("id, status, region_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!me || me.status !== "ACTIVE") {
    return NextResponse.json({ message: "No active employee profile" }, { status: 403 });
  }
  if (!me.region_id) {
    return NextResponse.json({ message: "Your account has no region. Contact an administrator." }, { status: 400 });
  }

  const { data: folder, error: folderErr } = await supabase
    .from("employee_file_region_folders")
    .select("id, path_segment")
    .eq("region_id", me.region_id)
    .maybeSingle();

  if (folderErr || !folder) {
    return NextResponse.json(
      {
        message:
          "File uploads are not enabled for your region yet. An administrator must create the region folder first.",
      },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const storageKey = buildEmployeeFileStorageKey(folder.path_segment, me.full_name ?? null, me.id, id, fileName, {
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
    employee_id: me.id,
    region_id: me.region_id,
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
