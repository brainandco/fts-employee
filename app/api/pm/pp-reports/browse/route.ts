import { browsePrefix } from "@/lib/employee-files/s3-browse";
import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";
import { ppReportsKeyPrefixBase } from "@/lib/pp-reports/storage";
import { requirePmEmployeeFilesAccess } from "@/lib/pm-files/auth";
import {
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const gate = await requirePmEmployeeFilesAccess();
  if (gate instanceof NextResponse) return gate;

  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket not configured (WASABI_PP_REPORTS_BUCKET)." }, { status: 503 });
  }

  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path") ?? "";
  const normalized =
    rawPath.trim() === "" ? "" : normalizeRelativePathUnderEmployee(rawPath);
  if (rawPath.trim() !== "" && !normalized) {
    return NextResponse.json({ message: "Invalid path" }, { status: 400 });
  }

  const base = ppReportsKeyPrefixBase();
  const searchPrefix = normalized
    ? `${base ? `${base}/` : ""}${normalized}/`
    : base
      ? `${base}/`
      : "";

  let s3;
  try {
    s3 = getWasabiPpReportsS3Client();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Wasabi configuration error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }

  const bucket = getWasabiPpReportsBucket()!;

  let entries;
  try {
    entries = await browsePrefix(s3, bucket, searchPrefix);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "List failed";
    const hint =
      /AccessDenied|403|not authorized|signature/i.test(raw)
        ? " Check that this Wasabi user may ListBucket/GetObject on WASABI_PP_REPORTS_BUCKET (and prefix if used)."
        : "";
    return NextResponse.json({ message: `${raw}${hint}` }, { status: 500 });
  }

  const folders = entries.filter((e) => e.type === "folder").map((e) => ({
    type: "folder" as const,
    name: e.name,
    path: normalized ? `${normalized}/${e.name}` : e.name,
  }));

  const files = entries
    .filter((e) => e.type === "file")
    .map((e) => ({
      type: "file" as const,
      name: e.name,
      key: e.key,
      size: e.size,
      lastModified: e.lastModified,
    }));

  return NextResponse.json({
    path: normalized,
    folders,
    files,
  });
}
