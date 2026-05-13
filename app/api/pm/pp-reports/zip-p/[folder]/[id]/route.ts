import {
  buildPpReportsZipStreamingResponse,
  resolvePmPpReportsFolderZip,
} from "@/lib/pp-reports/folder-zip";
import { fetchPpReportsZipShareLink } from "@/lib/employee-files/pp-reports-zip-share-link";
import { getDataClient } from "@/lib/supabase/server";
import { isPpReportsBucketConfigured } from "@/lib/wasabi/s3-client";

export const runtime = "nodejs";

/** Short public ZIP: `/api/pm/pp-reports/zip-p/{folderName}/{linkId}` */
export async function GET(_req: Request, ctx: { params: Promise<{ folder: string; id: string }> }) {
  if (!isPpReportsBucketConfigured()) {
    return new Response(JSON.stringify({ message: "PP reports bucket not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { folder: folderParam, id: linkId } = await ctx.params;
  const supabase = await getDataClient();

  let decodedFolder = folderParam;
  try {
    decodedFolder = decodeURIComponent(folderParam);
  } catch {
    return new Response(JSON.stringify({ message: "Invalid folder in URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fetched = await fetchPpReportsZipShareLink(supabase, linkId);
  if ("error" in fetched) {
    const status = fetched.error === "Link not found" || fetched.error === "Link expired" ? 401 : 400;
    return new Response(JSON.stringify({ message: fetched.error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { row } = fetched;
  if (row.link_kind !== "pm_bucket") {
    return new Response(JSON.stringify({ message: "Invalid link for this endpoint" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (decodedFolder !== row.folder_label) {
    return new Response(JSON.stringify({ message: "Folder name in URL does not match this link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = resolvePmPpReportsFolderZip(row.normalized_folder_path);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ message: resolved.message }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return buildPpReportsZipStreamingResponse(resolved.folder);
}
