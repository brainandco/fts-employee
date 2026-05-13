import { resolveSiteFolderZipContext, buildSiteFolderZipStreamingResponse } from "@/lib/employee-files/site-folder-zip";
import { parseSiteZipToken } from "@/lib/employee-files/site-zip-token";

export const runtime = "nodejs";

/** Legacy signed link: `?t=...`. New links use `/public/{folder}?c=...`. */
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

  return buildSiteFolderZipStreamingResponse(resolved);
}
