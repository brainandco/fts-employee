import { isKeyOwnedByReporter } from "@/lib/pp-reports/storage";
import { getWasabiPpReportsBucket, getWasabiPpReportsS3Client, isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";
import { s3CompleteMultipartUpload } from "@/lib/wasabi/s3-multipart-server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { NextResponse } from "next/server";

type PartIn = { PartNumber?: number; ETag?: string };

type Body = {
  storageKey?: string;
  uploadId?: string;
  parts?: PartIn[];
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

  const storageKey = String(body.storageKey ?? "").trim();
  const uploadId = String(body.uploadId ?? "").trim();
  const rawParts = Array.isArray(body.parts) ? body.parts : [];

  if (!storageKey || !uploadId || rawParts.length === 0) {
    return NextResponse.json({ message: "storageKey, uploadId, and parts are required" }, { status: 400 });
  }

  if (!isKeyOwnedByReporter(storageKey, gate.reporterFolderSlug)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const parts: { PartNumber: number; ETag: string }[] = [];
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i]!;
    const pn = typeof p.PartNumber === "number" && Number.isInteger(p.PartNumber) ? p.PartNumber : null;
    const etag = typeof p.ETag === "string" ? p.ETag.trim() : "";
    if (pn == null || pn < 1 || !etag) {
      return NextResponse.json({ message: `Invalid part at index ${i}` }, { status: 400 });
    }
    parts.push({ PartNumber: pn, ETag: etag });
  }

  try {
    const s3 = getWasabiPpReportsS3Client();
    const bucket = getWasabiPpReportsBucket()!;
    await s3CompleteMultipartUpload(s3, bucket, storageKey, uploadId, parts);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Complete failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
