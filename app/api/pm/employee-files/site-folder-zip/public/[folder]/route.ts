import {
  resolveSiteFolderZipContext,
  buildSiteFolderZipStreamingResponse,
} from "@/lib/employee-files/site-folder-zip";
import { folderLabelFromNormalizedSitePath, parseSiteZipToken } from "@/lib/employee-files/site-zip-token";

export const runtime = "nodejs";

/** Shorter public link: `/public/{folderName}?c={compactToken}`. */
export async function GET(req: Request, ctx: { params: Promise<{ folder: string }> }) {
  const { folder: folderParam } = await ctx.params;
  const url = new URL(req.url);
  const compact = String(url.searchParams.get("c") ?? "").trim();
  if (!compact) {
    return new Response(JSON.stringify({ message: "Missing token (c)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = parseSiteZipToken(compact);
  if (!payload) {
    return new Response(JSON.stringify({ message: "Invalid or expired link" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expectedLabel = folderLabelFromNormalizedSitePath(payload.path);
  let decodedLabel = folderParam;
  try {
    decodedLabel = decodeURIComponent(folderParam);
  } catch {
    return new Response(JSON.stringify({ message: "Invalid folder in URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (decodedLabel !== expectedLabel) {
    return new Response(JSON.stringify({ message: "Folder name in URL does not match this link" }), {
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

  return buildSiteFolderZipStreamingResponse(resolved);
}
