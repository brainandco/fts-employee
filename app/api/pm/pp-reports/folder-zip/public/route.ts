import { PassThrough, Readable } from "node:stream";
import {
  appendSiteFolderObjectsToArchive,
  createZipArchiver,
} from "@/lib/employee-files/site-folder-zip";
import {
  getS3ForPpReportsZip,
  resolvePmPpReportsFolderZip,
} from "@/lib/pp-reports/folder-zip";
import { parsePpReportsZipToken } from "@/lib/employee-files/pp-reports-zip-token";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeZipFileBase(name: string): string {
  const t = name.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return t || "folder";
}

/** Signed link: anyone with the URL can download the folder zip (no portal login). */
export async function GET(req: Request) {
  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket not configured." }, { status: 503 });
  }

  const token = String(new URL(req.url).searchParams.get("t") ?? "").trim();
  if (!token) {
    return new Response(JSON.stringify({ message: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = parsePpReportsZipToken(token);
  if (!payload || payload.scope !== "bucket") {
    return new Response(JSON.stringify({ message: "Invalid or expired link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = resolvePmPpReportsFolderZip(payload.path);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ message: resolved.message }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { s3, bucket } = getS3ForPpReportsZip();
  const pass = new PassThrough();
  const archive = createZipArchiver();
  archive.on("error", (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  const { folder } = resolved;
  const base = safeZipFileBase(folder.zipRootFolderName.split("/").pop() ?? "folder");
  const disp = `attachment; filename="${base}.zip"; filename*=UTF-8''${encodeURIComponent(`${base}.zip`)}`;

  void (async () => {
    try {
      await appendSiteFolderObjectsToArchive(s3, bucket, folder.s3Prefix, folder.zipRootFolderName, archive);
      await archive.finalize();
    } catch (e) {
      try {
        archive.abort();
      } catch {
        /* ignore */
      }
      pass.destroy(e instanceof Error ? e : new Error("Zip failed"));
    }
  })();

  const webBody = Readable.toWeb(pass) as unknown as BodyInit;
  return new Response(webBody, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": disp,
      "Cache-Control": "no-store",
    },
  });
}
