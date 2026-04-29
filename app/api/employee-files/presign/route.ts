import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import {
  buildEmployeeFileStorageKey,
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFileMaxBytes, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const PRESIGN_EXPIRES_SEC = 3600;

type Body = {
  fileName?: string;
  contentType?: string;
  byteSize?: number | null;
  /** Path under your employee folder, e.g. Apr-2026/28-Apr-2026 or custom segments. Empty uses month/day from uploadDate or today. */
  relativePath?: string | null;
  /** ISO date string — used with default month/year/day folders when relativePath is omitted. */
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
  if (!isAllowedEmployeeFileName(fileName)) {
    return NextResponse.json(
      {
        message:
          "File type not allowed. Use office or data types (e.g. pdf, doc, docx, xlsx, csv, ppt, zip, rar).",
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

  const fileId = randomUUID();
  const storageKey = buildEmployeeFileStorageKey(folder.path_segment, me.full_name ?? null, me.id, fileId, fileName, {
    relativePath,
    uploadDate,
  });

  const { error: insErr } = await supabase.from("employee_personal_files").insert({
    id: fileId,
    employee_id: me.id,
    region_id: me.region_id,
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
