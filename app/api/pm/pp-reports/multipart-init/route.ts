import {
  getWasabiEmployeeFileMaxBytes,
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { buildPpReportObjectKey } from "@/lib/pp-reports/storage";
import { requirePmEmployeeFilesAccess } from "@/lib/pm-files/auth";
import { multipartPartCount, multipartPartSizeBytesForFile, S3_SINGLE_PUT_MAX_BYTES } from "@/lib/wasabi/s3-multipart-constants";
import { s3CreateMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

type Body = {
  relativePath?: string | null;
  fileName?: string;
  contentType?: string | null;
  byteSize?: number | null;
};

export async function POST(req: Request) {
  const auth = await requirePmEmployeeFilesAccess();
  if (auth instanceof NextResponse) return auth;

  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket is not configured." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const fileName = String(body.fileName ?? "").trim();
  if (!fileName) {
    return NextResponse.json({ message: "fileName is required" }, { status: 400 });
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

  let storageKey: string;
  try {
    storageKey = buildPpReportObjectKey(body.relativePath ?? null, fileName);
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Invalid upload" }, { status: 400 });
  }

  const partSizeBytes = multipartPartSizeBytesForFile(byteSize);
  const partCount = multipartPartCount(byteSize, partSizeBytes);

  try {
    const s3 = getWasabiPpReportsS3Client();
    const bucket = getWasabiPpReportsBucket()!;
    const uploadId = await s3CreateMultipartUpload(s3, bucket, storageKey, contentType);
    return NextResponse.json({
      uploadId,
      storageKey,
      partSizeBytes,
      partCount,
      expiresIn: 4 * 3600,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Multipart init failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
