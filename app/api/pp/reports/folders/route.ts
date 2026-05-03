import { PutObjectCommand } from "@aws-sdk/client-s3";
import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { ppReportsKeyPrefixBase } from "@/lib/pp-reports/storage";
import {
  getWasabiEmployeeFilesS3Client,
  getWasabiPpReportsBucket,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

type Body = { relativePath?: string };

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

  const rel = normalizeRelativePathUnderEmployee(String(body.relativePath ?? ""));
  if (!rel) {
    return NextResponse.json({ message: "relativePath is required" }, { status: 400 });
  }

  const base = ppReportsKeyPrefixBase();
  const markerKey = `${base ? `${base}/` : ""}${rel}/.keep`;

  const s3 = getWasabiEmployeeFilesS3Client();
  const bucket = getWasabiPpReportsBucket()!;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: markerKey,
        Body: "",
      })
    );
    return NextResponse.json({ ok: true, created: rel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create folder failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
