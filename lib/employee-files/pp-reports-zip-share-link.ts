import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LEN = 12;

function newShareLinkId(): string {
  const b = randomBytes(ID_LEN);
  let s = "";
  for (let i = 0; i < ID_LEN; i++) {
    s += ID_CHARS[b[i]! % ID_CHARS.length]!;
  }
  return s;
}

export type PpReportsZipShareLinkKind = "admin_bucket" | "pm_bucket" | "reporter";

export type PpReportsZipShareLinkRow = {
  link_kind: PpReportsZipShareLinkKind;
  reporter_slug: string | null;
  normalized_folder_path: string;
  folder_label: string;
  expires_at: string;
};

/** Last path segment — used in public download URLs (searchable in chat). */
export function ppReportsFolderLabelFromNormalizedPath(normalizedFolderPath: string): string {
  const parts = normalizedFolderPath.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : "folder";
}

export async function insertPpReportsZipShareLink(
  supabase: SupabaseClient,
  row: {
    link_kind: PpReportsZipShareLinkKind;
    reporter_slug: string | null;
    normalized_folder_path: string;
    folder_label: string;
    expires_at: string;
  }
): Promise<{ id: string } | { error: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = newShareLinkId();
    const { error } = await supabase.from("pp_reports_zip_share_links").insert({
      id,
      link_kind: row.link_kind,
      reporter_slug: row.reporter_slug,
      normalized_folder_path: row.normalized_folder_path,
      folder_label: row.folder_label,
      expires_at: row.expires_at,
    });
    if (!error) return { id };
    const msg = String(error.message ?? "");
    if (!msg.toLowerCase().includes("duplicate") && !msg.toLowerCase().includes("unique")) {
      return { error: msg || "Insert failed" };
    }
  }
  return { error: "Could not allocate a unique link id" };
}

export async function fetchPpReportsZipShareLink(
  supabase: SupabaseClient,
  id: string
): Promise<{ row: PpReportsZipShareLinkRow } | { error: string }> {
  const clean = String(id ?? "").trim();
  if (!clean || clean.length > 32) {
    return { error: "Invalid link" };
  }
  const { data, error } = await supabase
    .from("pp_reports_zip_share_links")
    .select("link_kind, reporter_slug, normalized_folder_path, folder_label, expires_at")
    .eq("id", clean)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Link not found" };
  const row = data as PpReportsZipShareLinkRow;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { error: "Link expired" };
  }
  return { row };
}
