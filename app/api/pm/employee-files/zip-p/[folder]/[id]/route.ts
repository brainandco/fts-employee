import { getDataClient } from "@/lib/supabase/server";
import { buildSiteFolderZipStreamingResponse, resolveSiteFolderZipContext } from "@/lib/employee-files/site-folder-zip";
import { fetchSiteZipShareLink } from "@/lib/employee-files/site-zip-share-link";

export const runtime = "nodejs";

/** Short public ZIP: `/api/pm/employee-files/zip-p/{folderName}/{linkId}` */
export async function GET(_req: Request, ctx: { params: Promise<{ folder: string; id: string }> }) {
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

  const fetched = await fetchSiteZipShareLink(supabase, linkId);
  if ("error" in fetched) {
    const status = fetched.error === "Link not found" || fetched.error === "Link expired" ? 401 : 400;
    return new Response(JSON.stringify({ message: fetched.error }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { row } = fetched;
  if (decodedFolder !== row.folder_label) {
    return new Response(JSON.stringify({ message: "Folder name in URL does not match this link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolved = await resolveSiteFolderZipContext(row.region_id, row.employee_id, row.normalized_site_path);
  if (!resolved.ok) {
    return new Response(JSON.stringify({ message: resolved.message }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return buildSiteFolderZipStreamingResponse(resolved);
}
