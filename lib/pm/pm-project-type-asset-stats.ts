import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAssetReceiptStatusMap } from "@/lib/assets/asset-receipt-status";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";

export type PmProjectTypeKey = "MS" | "Rollout" | "Other";

export type PmAssetBreakdownAssignee = {
  employeeId: string;
  employeeName: string;
  receiptStatus: "confirmed" | "pending" | "none";
};

export type PmAssetBreakdownLine = {
  category: string;
  brand: string;
  label: string;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  pendingAssignees: { employeeId: string; employeeName: string }[];
};

export type PmProjectTypeAssetBucket = {
  projectType: PmProjectTypeKey;
  title: string;
  totalAssets: number;
  confirmedCount: number;
  pendingCount: number;
  lines: PmAssetBreakdownLine[];
};

export type PmProjectTypeAssetOverview = {
  ms: PmProjectTypeAssetBucket;
  rollout: PmProjectTypeAssetBucket;
  other: PmProjectTypeAssetBucket;
  grandTotal: number;
  grandConfirmed: number;
  grandPending: number;
};

/** Still on an employee — includes pending return (not yet collected). */
const ASSIGNED_STATUSES = ["Assigned", "With_QC", "Under_Maintenance", "Damaged", "Pending_Return"] as const;

const CANONICAL_BRANDS: [RegExp, string][] = [
  [/\bsamsung\b/i, "Samsung"],
  [/\bhuawei\b/i, "Huawei"],
  [/\biphone\b/i, "iPhone"],
  [/\bapple\b/i, "Apple"],
  [/\bsony\b/i, "Sony"],
  [/\blenovo\b/i, "Lenovo"],
  [/\bhp\b/i, "HP"],
  [/\bdell\b/i, "Dell"],
  [/\bacer\b/i, "Acer"],
  [/\basus\b/i, "Asus"],
];

function formatBrandToken(token: string): string {
  if (!token) return token;
  const lower = token.toLowerCase();
  if (lower === "hp") return "HP";
  if (lower === "iphone") return "iPhone";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function formatBrandName(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (part === " " || part === "-" || part === "/" || part === "") return part;
      return formatBrandToken(part);
    })
    .join("");
}

function canonicalBrand(companyOrRaw: string, model: string | null): string {
  const haystack = `${companyOrRaw} ${model ?? ""}`.trim();
  for (const [re, label] of CANONICAL_BRANDS) {
    if (re.test(haystack)) return label;
  }
  const fromCompany = formatBrandName(companyOrRaw);
  if (fromCompany) return fromCompany;
  const firstModel = (model ?? "").trim().split(/\s+/)[0];
  if (firstModel) return formatBrandName(firstModel);
  return "Unknown";
}

function rawCompanyFromSpecs(specs: unknown): string {
  if (specs && typeof specs === "object" && !Array.isArray(specs)) {
    const c = (specs as Record<string, unknown>).company;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Merge mobile-like categories so Samsung phones are one line. */
function normalizeCategoryForGrouping(category: string): string {
  const c = category.trim().toLowerCase().replace(/\s+/g, " ");
  if (!c) return "Other";
  if (
    c.includes("mobile") ||
    c.includes("phone") ||
    c === "aramco mobile device" ||
    c === "aramd" ||
    (c.includes("aramco") && c.includes("device"))
  ) {
    return "Mobile";
  }
  if (c === "laptop" || c === "laptops") return "Laptop";
  return category.trim();
}

function brandGroupingKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, " ") || "unknown";
}

function breakdownLabel(brand: string, category: string): string {
  return `${brand} · ${category}`;
}

function lineKey(brand: string, category: string): string {
  return `${brandGroupingKey(brand)}|${category.trim().toLowerCase() || "other"}`;
}

function emptyBucket(type: PmProjectTypeKey): PmProjectTypeAssetBucket {
  const title =
    type === "MS" ? "MS projects" : type === "Rollout" ? "Rollout projects" : "Other projects";
  return {
    projectType: type,
    title,
    totalAssets: 0,
    confirmedCount: 0,
    pendingCount: 0,
    lines: [],
  };
}

/** MS / Rollout from projects.project_type — supports values like "STC Rollout", "STC MS". */
function resolveProjectTypeKey(raw: string): PmProjectTypeKey {
  const n = raw.trim().toLowerCase();
  if (!n) return "Other";
  if (n === "rollout" || /\brollout\b/.test(n)) return "Rollout";
  if (n === "ms" || /\bms\b/.test(n)) return "MS";
  return "Other";
}

function buildBucket(
  type: PmProjectTypeKey,
  map: Map<
    string,
    PmAssetBreakdownLine & {
      assigneeMap: Map<string, PmAssetBreakdownAssignee>;
    }
  >
): PmProjectTypeAssetBucket {
  const lines = [...map.values()]
    .map((entry) => {
      const pendingAssignees = [...entry.assigneeMap.values()]
        .filter((a) => a.receiptStatus === "pending" || a.receiptStatus === "none")
        .map((a) => ({ employeeId: a.employeeId, employeeName: a.employeeName }))
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      return {
        category: entry.category,
        brand: entry.brand,
        label: entry.label,
        count: entry.count,
        confirmedCount: entry.confirmedCount,
        pendingCount: entry.pendingCount,
        pendingAssignees,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const totalAssets = lines.reduce((s, l) => s + l.count, 0);
  const confirmedCount = lines.reduce((s, l) => s + l.confirmedCount, 0);
  const pendingCount = lines.reduce((s, l) => s + l.pendingCount, 0);

  return {
    projectType: type,
    title: type === "MS" ? "MS projects" : type === "Rollout" ? "Rollout projects" : "Other projects",
    totalAssets,
    confirmedCount,
    pendingCount,
    lines,
  };
}

export function emptyPmProjectTypeAssetOverview(): PmProjectTypeAssetOverview {
  const ms = emptyBucket("MS");
  const rollout = emptyBucket("Rollout");
  const other = emptyBucket("Other");
  return {
    ms,
    rollout,
    other,
    grandTotal: 0,
    grandConfirmed: 0,
    grandPending: 0,
  };
}

function mergeReceiptStatus(
  a: PmAssetBreakdownAssignee["receiptStatus"],
  b: PmAssetBreakdownAssignee["receiptStatus"]
): PmAssetBreakdownAssignee["receiptStatus"] {
  if (a === "pending" || b === "pending") return "pending";
  if (a === "none" || b === "none") return "none";
  return "confirmed";
}

type AssetRow = {
  id: string;
  assigned_to_employee_id: string | null;
  category: string | null;
  model: string | null;
  name: string | null;
  specs: unknown;
  status: string;
  assigned_by: string | null;
};

/** Latest PM assignment per asset from history (for rows where assets.assigned_by was cleared). */
async function loadLatestPmHistoryByAsset(
  supabase: SupabaseClient,
  authUserId: string
): Promise<Map<string, string>> {
  const { data: rows } = await supabase
    .from("asset_assignment_history")
    .select("asset_id, to_employee_id, assigned_at")
    .eq("assigned_by_user_id", authUserId)
    .order("assigned_at", { ascending: false })
    .limit(5000);

  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const assetId = row.asset_id as string;
    if (!map.has(assetId)) map.set(assetId, row.to_employee_id as string);
  }
  return map;
}

function assetIncludedForPm(
  asset: AssetRow,
  authUserId: string,
  historyAssigneeByAsset: Map<string, string>
): boolean {
  if (!asset.assigned_to_employee_id) return false;
  if (asset.assigned_by === authUserId) return true;
  if (asset.assigned_by) return false;
  const histEmp = historyAssigneeByAsset.get(asset.id);
  return histEmp != null && histEmp === asset.assigned_to_employee_id;
}

export async function loadPmProjectTypeAssetOverview(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<PmProjectTypeAssetOverview> {
  if (!authUserId) return emptyPmProjectTypeAssetOverview();

  const { allowedRegionIds } = await loadPmScopeIds(supabase, employee, authUserId);
  if (allowedRegionIds.length === 0) return emptyPmProjectTypeAssetOverview();

  const [historyAssigneeByAsset, { data: directAssets }, { data: nullByAssets }] = await Promise.all([
    loadLatestPmHistoryByAsset(supabase, authUserId),
    supabase
      .from("assets")
      .select("id, assigned_to_employee_id, category, model, name, specs, status, assigned_by")
      .eq("assigned_by", authUserId)
      .in("status", [...ASSIGNED_STATUSES]),
    supabase
      .from("assets")
      .select("id, assigned_to_employee_id, category, model, name, specs, status, assigned_by")
      .is("assigned_by", null)
      .not("assigned_to_employee_id", "is", null)
      .in("status", [...ASSIGNED_STATUSES]),
  ]);

  const assetMap = new Map<string, AssetRow>();
  for (const a of directAssets ?? []) {
    assetMap.set(a.id as string, a as AssetRow);
  }
  for (const a of nullByAssets ?? []) {
    const row = a as AssetRow;
    if (assetIncludedForPm(row, authUserId, historyAssigneeByAsset)) {
      assetMap.set(row.id, row);
    }
  }

  const includedAssets = [...assetMap.values()];
  if (includedAssets.length === 0) return emptyPmProjectTypeAssetOverview();

  const assigneeIds = [...new Set(includedAssets.map((a) => a.assigned_to_employee_id).filter(Boolean) as string[])];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, full_name, project_id")
    .in("id", assigneeIds);

  const empById = new Map(
    (assignees ?? []).map((e) => [
      e.id as string,
      {
        id: e.id as string,
        full_name: (e.full_name as string | null) ?? "—",
        project_id: e.project_id as string | null,
      },
    ])
  );

  const projectIds = [...new Set((assignees ?? []).map((e) => e.project_id).filter(Boolean) as string[])];
  const projectTypeMap = new Map<string, PmProjectTypeKey>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, project_type").in("id", projectIds);
    for (const p of projects ?? []) {
      projectTypeMap.set(p.id as string, resolveProjectTypeKey((p.project_type as string) ?? ""));
    }
  }

  type ScopedAsset = {
    id: string;
    employeeId: string;
    employeeName: string;
    projectType: PmProjectTypeKey;
    category: string;
    brand: string;
    label: string;
    key: string;
  };

  const scoped: ScopedAsset[] = [];
  for (const a of includedAssets) {
    const empId = a.assigned_to_employee_id as string;
    const emp = empById.get(empId);
    if (!emp) continue;

    const projectType = emp.project_id ? (projectTypeMap.get(emp.project_id) ?? "Other") : "Other";
    const category = normalizeCategoryForGrouping((a.category as string | null) ?? "");
    const brand = canonicalBrand(rawCompanyFromSpecs(a.specs), (a.model as string | null) ?? null);
    scoped.push({
      id: a.id,
      employeeId: empId,
      employeeName: emp.full_name,
      projectType,
      category,
      brand,
      label: breakdownLabel(brand, category),
      key: lineKey(brand, category),
    });
  }

  if (scoped.length === 0) return emptyPmProjectTypeAssetOverview();

  const receiptMap = await loadAssetReceiptStatusMap(
    supabase,
    [...new Set(scoped.map((s) => s.employeeId))],
    scoped.map((s) => s.id)
  );

  const bucketMaps: Record<
    PmProjectTypeKey,
    Map<string, PmAssetBreakdownLine & { assigneeMap: Map<string, PmAssetBreakdownAssignee> }>
  > = {
    MS: new Map(),
    Rollout: new Map(),
    Other: new Map(),
  };

  for (const item of scoped) {
    const receipt = receiptMap.get(`${item.employeeId}:${item.id}`);
    const receiptStatus: PmAssetBreakdownAssignee["receiptStatus"] =
      receipt === "confirmed" ? "confirmed" : receipt === "pending" ? "pending" : "none";

    const map = bucketMaps[item.projectType];
    let line = map.get(item.key);
    if (!line) {
      line = {
        category: item.category,
        brand: item.brand,
        label: item.label,
        count: 0,
        confirmedCount: 0,
        pendingCount: 0,
        pendingAssignees: [],
        assigneeMap: new Map(),
      };
      map.set(item.key, line);
    }

    line.count += 1;
    if (receiptStatus === "confirmed") line.confirmedCount += 1;
    else line.pendingCount += 1;

    const existingAssignee = line.assigneeMap.get(item.employeeId);
    const mergedStatus = existingAssignee
      ? mergeReceiptStatus(existingAssignee.receiptStatus, receiptStatus)
      : receiptStatus;
    line.assigneeMap.set(item.employeeId, {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      receiptStatus: mergedStatus,
    });
  }

  const ms = buildBucket("MS", bucketMaps.MS);
  const rollout = buildBucket("Rollout", bucketMaps.Rollout);
  const other = buildBucket("Other", bucketMaps.Other);

  const grandTotal = ms.totalAssets + rollout.totalAssets + other.totalAssets;
  const grandConfirmed = ms.confirmedCount + rollout.confirmedCount + other.confirmedCount;
  const grandPending = ms.pendingCount + rollout.pendingCount + other.pendingCount;

  return { ms, rollout, other, grandTotal, grandConfirmed, grandPending };
}

/** Category totals across all PM assignments (for mobile legacy chips). */
export function pmOverviewToCategoryCounts(overview: PmProjectTypeAssetOverview): { category: string; count: number }[] {
  const map = new Map<string, number>();
  for (const bucket of [overview.ms, overview.rollout, overview.other]) {
    for (const line of bucket.lines) {
      map.set(line.category, (map.get(line.category) ?? 0) + line.count);
    }
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
