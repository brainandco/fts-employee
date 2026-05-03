import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  getWasabiEmployeeFileMaxBytes,
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { buildPpReportObjectKey, scopeReporterRelativePath } from "@/lib/pp-reports/storage";
import { NextResponse } from "next/server";

const PRESIGN_EXPIRES_SEC = 3600;

type Body = {
  relativePath?: string | null;
  fileName?: string;
  contentType?: string;
  byteSize?: number | null;
};

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

  const fileName = String(body.fileName ?? "").trim();
  if (!fileName) {
    return NextResponse.json({ message: "fileName is required" }, { status: 400 });
  }

  const byteSize = typeof body.byteSize === "number" && Number.isFinite(body.byteSize) ? Math.floor(body.byteSize) : null;
  const maxB = getWasabiEmployeeFileMaxBytes();
  if (byteSize != null && byteSize > maxB) {
    return NextResponse.json({ message: `File exceeds maximum size (${maxB} bytes)` }, { status: 400 });
  }

  const contentType = String(body.contentType ?? "application/octet-stream").trim() || "application/octet-stream";

  const rawBrowse = body.relativePath;
  const underReporter: string =
    rawBrowse != null && String(rawBrowse).trim() !== ""
      ? normalizeRelativePathUnderEmployee(String(rawBrowse)) ?? ""
      : "";
  if (rawBrowse != null && String(rawBrowse).trim() !== "" && !underReporter) {
    return NextResponse.json({ message: "Invalid relativePath" }, { status: 400 });
  }
  const scoped = scopeReporterRelativePath(gate.reporterFolderSlug, underReporter);
  if (!scoped) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  let storageKey: string;
  try {
    storageKey = buildPpReportObjectKey(scoped, fileName);
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Invalid upload" }, { status: 400 });
  }

  try {
    const s3 = getWasabiPpReportsS3Client();
    const bucket = getWasabiPpReportsBucket()!;
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
    return NextResponse.json({
      uploadUrl,
      storageKey,
      expiresIn: PRESIGN_EXPIRES_SEC,
      headers: { "Content-Type": contentType },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Presign failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
