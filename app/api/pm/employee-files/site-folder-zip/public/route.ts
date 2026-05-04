import { PassThrough, Readable } from "node:stream";
import {
  appendSiteFolderObjectsToArchive,
  createZipArchiver,
  getS3ForSiteZip,
  resolveSiteFolderZipContext,
} from "@/lib/employee-files/site-folder-zip";
import { parseSiteZipToken } from "@/lib/employee-files/site-zip-token";

export const runtime = "nodejs";

function safeZipFileBase(name: string): string {
  const t = name.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return t || "site";
}

/** Signed link: anyone with the URL can download the zip (no portal login). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("t") ?? "").trim();
  if (!token) {
    return new Response(JSON.stringify({ message: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = parseSiteZipToken(token);
  if (!payload) {
    return new Response(JSON.stringify({ message: "Invalid or expired link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = await resolveSiteFolderZipContext(payload.rid, payload.eid, payload.path);
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
