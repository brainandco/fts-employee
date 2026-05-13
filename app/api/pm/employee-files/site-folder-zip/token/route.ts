import { resolveSiteFolderZipContext } from "@/lib/employee-files/site-folder-zip";
import { folderLabelFromNormalizedSitePath } from "@/lib/employee-files/site-zip-token";
import { insertSiteZipShareLink } from "@/lib/employee-files/site-zip-share-link";
import { getDataClient } from "@/lib/supabase/server";
import {
  assertPmRegion,
  requirePmEmployeeFilesAccess,
} from "@/lib/pm-files/auth";
import { NextResponse } from "next/server";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Body = { regionId?: string; employeeId?: string; sitePath?: string; ttlMs?: number };

export async function POST(req: Request) {
  const gate = await requirePmEmployeeFilesAccess();
  if (gate instanceof NextResponse) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const regionId = String(body.regionId ?? "").trim();
  const employeeId = String(body.employeeId ?? "").trim();
  const sitePath = String(body.sitePath ?? "").trim();
  if (!regionId || !employeeId || !sitePath) {
    return NextResponse.json({ message: "regionId, employeeId, and sitePath are required" }, { status: 400 });
  }
  if (!assertPmRegion(regionId, gate.allowedRegionIds)) {
    return NextResponse.json({ message: "Region not allowed for your PM scope." }, { status: 403 });
  }

  const resolved = await resolveSiteFolderZipContext(regionId, employeeId, sitePath);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }

  const ttl = typeof body.ttlMs === "number" && body.ttlMs > 0 && body.ttlMs <= 30 * 24 * 60 * 60 * 1000 ? body.ttlMs : DEFAULT_TTL_MS;
  const exp = Date.now() + ttl;
  const expiresAtIso = new Date(exp).toISOString();
  const folderLabel = folderLabelFromNormalizedSitePath(resolved.normalizedSitePath);

  const supabase = await getDataClient();
  const inserted = await insertSiteZipShareLink(supabase, {
    region_id: regionId,
    employee_id: employeeId,
    normalized_site_path: resolved.normalizedSitePath,
    folder_label: folderLabel,
    expires_at: expiresAtIso,
  });
  if ("error" in inserted) {
    const hint =
      inserted.error.toLowerCase().includes("relation") || inserted.error.toLowerCase().includes("does not exist")
        ? " Apply migration 00067_employee_site_zip_share_links.sql (or run pending Supabase migrations)."
        : "";
    return NextResponse.json({ message: `${inserted.error}${hint}` }, { status: 503 });
  }

  const self = new URL(req.url);
  const origin = self.origin;
  const encFolder = encodeURIComponent(folderLabel);
  const publicUrl = `${origin}/api/pm/employee-files/zip-p/${encFolder}/${inserted.id}`;

  return NextResponse.json({
    url: publicUrl,
    expiresAt: expiresAtIso,
    folderLabel,
    linkId: inserted.id,
    zipFileName: `${folderLabel}.zip`,
  });
}
