import {
  insertPpReportsZipShareLink,
  ppReportsFolderLabelFromNormalizedPath,
} from "@/lib/employee-files/pp-reports-zip-share-link";
import { requirePostProcessor } from "@/lib/pp/auth";
import { resolvePpReporterFolderZip } from "@/lib/pp-reports/folder-zip";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Body = { path?: string; ttlMs?: number };

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const rawPath = String(body.path ?? "").trim();
  const resolved = resolvePpReporterFolderZip(gate.reporterFolderSlug, rawPath);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }

  const ttl =
    typeof body.ttlMs === "number" && body.ttlMs > 0 && body.ttlMs <= 30 * 24 * 60 * 60 * 1000
      ? body.ttlMs
      : DEFAULT_TTL_MS;
  const exp = Date.now() + ttl;
  const expiresAtIso = new Date(exp).toISOString();
  const norm = resolved.folder.zipRootFolderName;
  const folderLabel = ppReportsFolderLabelFromNormalizedPath(norm);

  const supabase = await getDataClient();
  const inserted = await insertPpReportsZipShareLink(supabase, {
    link_kind: "reporter",
    reporter_slug: gate.reporterFolderSlug,
    normalized_folder_path: norm,
    folder_label: folderLabel,
    expires_at: expiresAtIso,
  });
  if ("error" in inserted) {
    const hint =
      inserted.error.toLowerCase().includes("relation") || inserted.error.toLowerCase().includes("does not exist")
        ? " Apply migration 00068_pp_reports_zip_share_links.sql (or run pending Supabase migrations)."
        : "";
    return NextResponse.json({ message: `${inserted.error}${hint}` }, { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const encFolder = encodeURIComponent(folderLabel);
  const publicUrl = `${origin}/api/pp/reports/zip-p/${encFolder}/${inserted.id}`;

  return NextResponse.json({
    url: publicUrl,
    expiresAt: expiresAtIso,
    folderLabel,
    linkId: inserted.id,
    zipFileName: `${folderLabel}.zip`,
  });
}
