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

export type SiteZipShareLinkRow = {
  region_id: string;
  employee_id: string;
  normalized_site_path: string;
  folder_label: string;
  expires_at: string;
};

export async function insertSiteZipShareLink(
  supabase: SupabaseClient,
  row: {
    region_id: string;
    employee_id: string;
    normalized_site_path: string;
    folder_label: string;
    expires_at: string;
  }
): Promise<{ id: string } | { error: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = newShareLinkId();
    const { error } = await supabase.from("employee_site_zip_share_links").insert({
      id,
      region_id: row.region_id,
      employee_id: row.employee_id,
      normalized_site_path: row.normalized_site_path,
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

export async function fetchSiteZipShareLink(
  supabase: SupabaseClient,
  id: string
): Promise<{ row: SiteZipShareLinkRow } | { error: string }> {
  const clean = String(id ?? "").trim();
  if (!clean || clean.length > 32) {
    return { error: "Invalid link" };
  }
  const { data, error } = await supabase
    .from("employee_site_zip_share_links")
    .select("region_id, employee_id, normalized_site_path, folder_label, expires_at")
    .eq("id", clean)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Link not found" };
  const row = data as SiteZipShareLinkRow;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { error: "Link expired" };
  }
  return { row };
}
