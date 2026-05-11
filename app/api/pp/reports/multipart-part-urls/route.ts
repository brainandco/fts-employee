import { isKeyOwnedByReporter } from "@/lib/pp-reports/storage";
import { getWasabiPpReportsBucket, getWasabiPpReportsS3Client, isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";
import { multipartPartSignExpiresSec, s3PresignUploadPart } from "@/lib/wasabi/s3-multipart-server";
import { requirePostProcessor } from "@/lib/pp/auth";
import { NextResponse } from "next/server";

const MAX_PART_NUMBERS = 40;

type Body = {
  storageKey?: string;
  uploadId?: string;
  partNumbers?: number[];
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
  const rawParts = Array.isArray(body.partNumbers) ? body.partNumbers : [];
  const partNumbers = rawParts
    .map((n) => (typeof n === "number" && Number.isInteger(n) ? n : null))
    .filter((n): n is number => n != null && n >= 1 && n <= 10_000);

  if (!storageKey || !uploadId || partNumbers.length === 0) {
    return NextResponse.json({ message: "storageKey, uploadId, and partNumbers are required" }, { status: 400 });
  }
  if (partNumbers.length > MAX_PART_NUMBERS) {
    return NextResponse.json({ message: `At most ${MAX_PART_NUMBERS} parts per request` }, { status: 400 });
  }

  if (!isKeyOwnedByReporter(storageKey, gate.reporterFolderSlug)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const s3 = getWasabiPpReportsS3Client();
    const bucket = getWasabiPpReportsBucket()!;
    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        uploadUrl: await s3PresignUploadPart(s3, bucket, storageKey, uploadId, partNumber),
      }))
    );
    return NextResponse.json({ parts, expiresIn: multipartPartSignExpiresSec() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Presign failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
