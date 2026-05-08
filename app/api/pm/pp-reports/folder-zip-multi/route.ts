import { PassThrough, Readable } from "node:stream";
import {
  appendSiteFolderObjectsToArchive,
  createZipArchiver,
  MAX_OBJECTS_IN_ZIP,
  MAX_OBJECTS_MULTI_ZIP_TOTAL,
} from "@/lib/employee-files/site-folder-zip";
import { getS3ForPpReportsZip, resolveMultiPmPpReportsFolders } from "@/lib/pp-reports/folder-zip";
import { requirePmEmployeeFilesAccess } from "@/lib/pm-files/auth";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeZipFileBase(name: string): string {
  const t = name.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return t || "folders";
}

/** POST { paths: string[] } — zip multiple folders in the PP final-reports bucket. */
export async function POST(req: Request) {
  const gate = await requirePmEmployeeFilesAccess();
  if (gate instanceof NextResponse) return gate;

  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket not configured." }, { status: 503 });
  }

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const paths = Array.isArray(body.paths) ? body.paths.map((p) => String(p ?? "").trim()).filter(Boolean) : [];
  if (paths.length === 0) {
    return NextResponse.json({ message: "A non-empty paths array is required" }, { status: 400 });
  }

  const resolved = resolveMultiPmPpReportsFolders(paths);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }

  const { s3, bucket } = getS3ForPpReportsZip();
  const pass = new PassThrough();
  const archive = createZipArchiver();
  archive.on("error", (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  const multi = resolved.folders.length > 1;
  const base = safeZipFileBase(
    multi ? "pp-reports-folders-bundle" : resolved.folders[0].zipRootFolderName.split("/").pop() ?? "folder"
  );
  const disp = `attachment; filename="${base}.zip"; filename*=UTF-8''${encodeURIComponent(`${base}.zip`)}`;

  void (async () => {
    try {
      let budget = MAX_OBJECTS_MULTI_ZIP_TOTAL;
      for (const folder of resolved.folders) {
        if (budget <= 0) break;
        const take = Math.min(MAX_OBJECTS_IN_ZIP, budget);
        const { objectCount } = await appendSiteFolderObjectsToArchive(
          s3,
          bucket,
          folder.s3Prefix,
          folder.zipRootFolderName,
          archive,
          { maxObjects: take }
        );
        budget -= objectCount;
      }
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
