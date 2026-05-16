import { PutObjectCommand } from "@aws-sdk/client-s3";
import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { validatePpReportFolderCreate } from "@/lib/pp-reports/folder-hierarchy";
import { ppReportsKeyPrefixBase, scopeReporterRelativePath } from "@/lib/pp-reports/storage";
import { getDataClient } from "@/lib/supabase/server";
import {
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
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

  const relRaw = String(body.relativePath ?? "").trim();
  if (!relRaw) {
    return NextResponse.json({ message: "relativePath is required" }, { status: 400 });
  }

  const lastSlash = relRaw.lastIndexOf("/");
  const parentPath = lastSlash >= 0 ? relRaw.slice(0, lastSlash) : "";
  const folderSegment = lastSlash >= 0 ? relRaw.slice(lastSlash + 1) : relRaw;
  const folderNorm = normalizeRelativePathUnderEmployee(folderSegment);
  const parentNorm = parentPath.trim() === "" ? "" : normalizeRelativePathUnderEmployee(parentPath);
  if (!folderNorm || (parentPath.trim() !== "" && parentNorm === null)) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }
  const rel = parentNorm ? `${parentNorm}/${folderNorm}` : folderNorm;

  const supabase = await getDataClient();
  const hierarchyOk = await validatePpReportFolderCreate(supabase, parentNorm ?? "", folderNorm);
  if (!hierarchyOk.ok) {
    return NextResponse.json({ message: hierarchyOk.message }, { status: 400 });
  }

  const scoped = scopeReporterRelativePath(gate.reporterFolderSlug, rel);
  if (!scoped) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const base = ppReportsKeyPrefixBase();
  const markerKey = `${base ? `${base}/` : ""}${scoped}/.keep`;

  const s3 = getWasabiPpReportsS3Client();
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
