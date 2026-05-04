import { PassThrough, Readable } from "node:stream";
import {
  appendSiteFolderObjectsToArchive,
  createZipArchiver,
  getS3ForSiteZip,
  resolveSiteFolderZipContext,
} from "@/lib/employee-files/site-folder-zip";
import {
  assertPmRegion,
  requirePmEmployeeFilesAccess,
} from "@/lib/pm-files/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function safeZipFileBase(name: string): string {
  const t = name.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return t || "site";
}

export async function GET(req: Request) {
  const gate = await requirePmEmployeeFilesAccess();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const regionId = String(url.searchParams.get("regionId") ?? "").trim();
  const employeeId = String(url.searchParams.get("employeeId") ?? "").trim();
  const sitePath = String(url.searchParams.get("sitePath") ?? "").trim();

  if (!regionId || !employeeId || !sitePath) {
    return new Response(JSON.stringify({ message: "regionId, employeeId, and sitePath are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!assertPmRegion(regionId, gate.allowedRegionIds)) {
    return new Response(JSON.stringify({ message: "Region not allowed for your PM scope." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = await resolveSiteFolderZipContext(regionId, employeeId, sitePath);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ message: resolved.message }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { s3, bucket } = getS3ForSiteZip();
  const pass = new PassThrough();
  const archive = createZipArchiver();
  archive.on("error", (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  const base = safeZipFileBase(resolved.archiveFolderName);
  const disp = `attachment; filename="${base}.zip"; filename*=UTF-8''${encodeURIComponent(`${base}.zip`)}`;

  void (async () => {
    try {
      await appendSiteFolderObjectsToArchive(s3, bucket, resolved.sitePrefix, resolved.archiveFolderName, archive);
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
