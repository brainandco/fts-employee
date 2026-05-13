import {
  buildPpReportsZipStreamingResponse,
  resolvePpReporterFolderZip,
} from "@/lib/pp-reports/folder-zip";
import { parsePpReportsZipToken } from "@/lib/employee-files/pp-reports-zip-token";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";

export const runtime = "nodejs";

/** Signed link: anyone with the URL can download the folder zip (no portal login). */
export async function GET(req: Request) {
  if (!isPpReportsBucketConfigured()) {
    return new Response(JSON.stringify({ message: "PP reports bucket not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = String(new URL(req.url).searchParams.get("t") ?? "").trim();
  if (!token) {
    return new Response(JSON.stringify({ message: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = parsePpReportsZipToken(token);
  if (!payload || payload.scope !== "reporter") {
    return new Response(JSON.stringify({ message: "Invalid or expired link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = resolvePpReporterFolderZip(payload.slug, payload.path);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ message: resolved.message }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return buildPpReportsZipStreamingResponse(resolved.folder);
}
