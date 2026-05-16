import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRelativePathUnderEmployee } from "@/lib/employee-files/storage";

export type PpReportRegionRow = { id: string; name: string; code: string | null; folder_name: string };
export type PpReportOperatorRow = { id: string; name: string; sort_order: number };
export type PpReportAccountRow = { id: string; name: string; sort_order: number };
export type PpReportProjectRow = {
  id: string;
  name: string;
  sort_order: number;
  operator_id: string;
  operator_name?: string;
};

export const PP_REPORT_HIERARCHY_LEVELS = ["region", "operator", "account", "project"] as const;
export type PpReportHierarchyLevel = (typeof PP_REPORT_HIERARCHY_LEVELS)[number];

/** Folder segment for a region (matches path normalization used on create). */
export function ppReportRegionFolderName(regionName: string): string | null {
  return normalizeRelativePathUnderEmployee(regionName);
}

export function ppReportPathSegments(pathUnderReporter: string): string[] {
  return pathUnderReporter
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
}

export function nextPpReportHierarchyLevel(pathUnderReporter: string): PpReportHierarchyLevel | null {
  const depth = ppReportPathSegments(pathUnderReporter).length;
  if (depth >= PP_REPORT_HIERARCHY_LEVELS.length) return null;
  return PP_REPORT_HIERARCHY_LEVELS[depth] ?? null;
}

export async function fetchPpReportRegions(supabase: SupabaseClient): Promise<PpReportRegionRow[]> {
  const { data, error } = await supabase.from("regions").select("id, name, code").order("name");
  if (error) throw new Error(error.message);
  const rows: PpReportRegionRow[] = [];
  for (const r of data ?? []) {
    const folder_name = ppReportRegionFolderName(String(r.name ?? ""));
    if (!folder_name) continue;
    rows.push({
      id: r.id as string,
      name: String(r.name ?? "").trim(),
      code: (r.code as string | null) ?? null,
      folder_name,
    });
  }
  return rows;
}

export async function fetchPpReportHierarchy(supabase: SupabaseClient) {
  const [regions, operatorsRes, accountsRes, projectsRes] = await Promise.all([
    fetchPpReportRegions(supabase),
    supabase
      .from("pp_report_operators")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("pp_report_accounts")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("pp_report_projects")
      .select("id, name, sort_order, operator_id, pp_report_operators(name)")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  if (operatorsRes.error) throw new Error(operatorsRes.error.message);
  if (accountsRes.error) throw new Error(accountsRes.error.message);
  if (projectsRes.error) throw new Error(projectsRes.error.message);

  const projects = (projectsRes.data ?? []).map((row) => {
    const op = row.pp_report_operators as { name?: string } | { name?: string }[] | null;
    const operator_name = Array.isArray(op) ? op[0]?.name : op?.name;
    return {
      id: row.id as string,
      name: row.name as string,
      sort_order: row.sort_order as number,
      operator_id: row.operator_id as string,
      operator_name: operator_name ?? undefined,
    };
  });

  return {
    regions,
    operators: (operatorsRes.data ?? []) as PpReportOperatorRow[],
    accounts: (accountsRes.data ?? []) as PpReportAccountRow[],
    projects,
  };
}

async function resolveRegionInPath(
  supabase: SupabaseClient,
  regionSegment: string
): Promise<{ ok: true; regionName: string } | { ok: false; message: string }> {
  const regions = await fetchPpReportRegions(supabase);
  const hit = regions.find((r) => r.folder_name === regionSegment);
  if (!hit) return { ok: false, message: "Invalid region folder in path." };
  return { ok: true, regionName: hit.name };
}

/**
 * Validates a new folder segment under the reporter path.
 * Path: Region → Operator → Account → Project
 */
export async function validatePpReportFolderCreate(
  supabase: SupabaseClient,
  parentPathUnderReporter: string,
  folderName: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const name = folderName.trim();
  if (!name) return { ok: false, message: "Folder name is required." };

  const segments = ppReportPathSegments(parentPathUnderReporter);
  const level = nextPpReportHierarchyLevel(parentPathUnderReporter);
  if (!level) {
    return {
      ok: false,
      message:
        "Folders can only be created at Region, Operator, Account, or Project level. Upload files inside the project folder.",
    };
  }

  if (level === "region") {
    const regions = await fetchPpReportRegions(supabase);
    if (!regions.some((r) => r.folder_name === name)) {
      return { ok: false, message: "Choose a valid region from the list (custom folder names are not allowed)." };
    }
    return { ok: true };
  }

  const regionSegment = segments[0];
  if (!regionSegment) {
    return { ok: false, message: "Create a region folder first." };
  }
  const regionOk = await resolveRegionInPath(supabase, regionSegment);
  if (!regionOk.ok) return regionOk;

  if (level === "operator") {
    const { data, error } = await supabase
      .from("pp_report_operators")
      .select("id")
      .eq("is_active", true)
      .eq("name", name)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) {
      return { ok: false, message: "Choose a valid operator from the list (custom folder names are not allowed)." };
    }
    return { ok: true };
  }

  const operatorName = segments[1];
  if (!operatorName) {
    return { ok: false, message: "Create an operator folder first." };
  }

  if (level === "account") {
    const { data: op, error: opErr } = await supabase
      .from("pp_report_operators")
      .select("id")
      .eq("is_active", true)
      .eq("name", operatorName)
      .maybeSingle();
    if (opErr) return { ok: false, message: opErr.message };
    if (!op) return { ok: false, message: "Invalid operator folder in path." };

    const { data, error } = await supabase
      .from("pp_report_accounts")
      .select("id")
      .eq("is_active", true)
      .eq("name", name)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) {
      return { ok: false, message: "Choose a valid account from the list (custom folder names are not allowed)." };
    }
    return { ok: true };
  }

  // project level
  const accountName = segments[2];
  if (!accountName) {
    return { ok: false, message: "Create operator and account folders first." };
  }

  const { data: op, error: opErr } = await supabase
    .from("pp_report_operators")
    .select("id")
    .eq("is_active", true)
    .eq("name", operatorName)
    .maybeSingle();
  if (opErr) return { ok: false, message: opErr.message };
  if (!op) return { ok: false, message: "Invalid operator folder in path." };

  const { data: acct, error: acctErr } = await supabase
    .from("pp_report_accounts")
    .select("id")
    .eq("is_active", true)
    .eq("name", accountName)
    .maybeSingle();
  if (acctErr) return { ok: false, message: acctErr.message };
  if (!acct) return { ok: false, message: "Invalid account folder in path." };

  const { data: project, error: projErr } = await supabase
    .from("pp_report_projects")
    .select("id")
    .eq("is_active", true)
    .eq("operator_id", op.id)
    .eq("name", name)
    .maybeSingle();
  if (projErr) return { ok: false, message: projErr.message };
  if (!project) {
    return {
      ok: false,
      message: `Choose a valid project for ${operatorName} from the list (custom folder names are not allowed).`,
    };
  }

  return { ok: true };
}
