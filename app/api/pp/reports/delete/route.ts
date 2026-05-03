import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requirePostProcessor } from "@/lib/pp/auth";
import { isKeyOwnedByReporter } from "@/lib/pp-reports/storage";
import { getWasabiPpReportsBucket, getWasabiPpReportsS3Client, isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

type Body = { key?: string };

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

  const key = String(body.key ?? "").trim();
  if (!key || key.includes("..") || !isKeyOwnedByReporter(key, gate.reporterFolderSlug)) {
    return NextResponse.json({ message: "Invalid key" }, { status: 400 });
  }

  const s3 = getWasabiPpReportsS3Client();
  const bucket = getWasabiPpReportsBucket()!;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
