import {
  getWasabiEmployeeFileMaxBytes,
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { isAllowedEmployeeFileName, normalizeRelativePathUnderEmployee, safeEmployeeFileName } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { buildPpReportObjectKey, scopeReporterRelativePath } from "@/lib/pp-reports/storage";
import {
  multipartPartCount,
  multipartPartSizeBytesForFile,
  MULTIPART_UPLOAD_THRESHOLD_BYTES,
} from "@/lib/wasabi/s3-multipart-constants";
import { s3CreateMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { NextResponse } from "next/server";

type Body = {
  fileName?: string;
  contentType?: string | null;
  byteSize?: number | null;
  defaultRelativePath?: string | null;
  relativePath?: string | null;
};

function combineUnderReporter(defaultRel: string | null | undefined, itemRel: string | null | undefined): string | null {
  const a = (defaultRel ?? "").trim();
  const b = (itemRel ?? "").trim();
  if (!a && !b) return "";
  if (!a) return normalizeRelativePathUnderEmployee(b);
  if (!b) return normalizeRelativePathUnderEmployee(a);
  const joined = `${a}/${b}`;
  return normalizeRelativePathUnderEmployee(joined);
}

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket is not configured." }, { status: 503 });
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

  const defRaw = body.defaultRelativePath;
  const defaultUnder =
    defRaw != null && String(defRaw).trim() !== "" ? normalizeRelativePathUnderEmployee(String(defRaw)) : "";
  if (defRaw != null && String(defRaw).trim() !== "" && !defaultUnder) {
    return NextResponse.json({ message: "Invalid defaultRelativePath" }, { status: 400 });
  }

  const itemRelRaw = body.relativePath;
  const combinedUnder = combineUnderReporter(
    defaultUnder,
    itemRelRaw != null && String(itemRelRaw).trim() !== "" ? String(itemRelRaw) : null
  );
  if (combinedUnder === null) {
    return NextResponse.json({ message: "Invalid relativePath" }, { status: 400 });
  }

  const scoped = scopeReporterRelativePath(gate.reporterFolderSlug, combinedUnder);
  if (!scoped) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  let storageKey: string;
  try {
    storageKey = buildPpReportObjectKey(scoped, fileName);
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
