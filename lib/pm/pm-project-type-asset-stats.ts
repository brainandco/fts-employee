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

const ASSIGNED_STATUSES = ["Assigned", "With_QC", "Under_Maintenance", "Damaged"] as const;

const WORD_DISPLAY: Record<string, string> = {
  hp: "HP",
  lg: "LG",
  ibm: "IBM",
  iphone: "iPhone",
};

function formatBrandToken(token: string): string {
  if (!token) return token;
  const lower = token.toLowerCase();
  if (WORD_DISPLAY[lower]) return WORD_DISPLAY[lower];
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

function rawBrandFromAsset(row: {
  name: string | null;
  specs: unknown;
  model: string | null;
}): string {
  if (row.specs && typeof row.specs === "object" && !Array.isArray(row.specs)) {
    const c = (row.specs as Record<string, unknown>).company;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const name = (row.name ?? "").trim();
  if (name) return name;
  const model = (row.model ?? "").trim();
  if (model) {
    const first = model.split(/\s+/)[0];
    if (first) return first;
  }
  return "Unknown";
}

function brandGroupingKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, " ") || "unknown";
}

function breakdownLabel(brand: string, category: string): string {
  const cat = category.trim() || "Other";
  const b = formatBrandName(brand) || "Unknown";
  return `${b} · ${cat}`;
}

function lineKey(brand: string, category: string): string {
  return `${brandGroupingKey(brand)}|${(category ?? "").trim().toLowerCase() || "other"}`;
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

function resolveProjectTypeKey(raw: string): PmProjectTypeKey {
  const n = raw.trim().toLowerCase();
  if (n === "ms") return "MS";
  if (n === "rollout") return "Rollout";
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
  return emptyOverview();
}

function emptyOverview(): PmProjectTypeAssetOverview {
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

export async function loadPmProjectTypeAssetOverview(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<PmProjectTypeAssetOverview> {
  if (!authUserId) return emptyOverview();

  const { allowedRegionIds } = await loadPmScopeIds(supabase, employee, authUserId);
  if (allowedRegionIds.length === 0) return emptyOverview();

  const allowedRegionSet = new Set(allowedRegionIds);

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id, full_name, project_id, region_id")
    .in("region_id", allowedRegionIds);

  const empById = new Map(
    (regionEmps ?? []).map((e) => [
      e.id as string,
      {
        id: e.id as string,
        full_name: (e.full_name as string | null) ?? "—",
        project_id: e.project_id as string | null,
        region_id: e.region_id as string | null,
      },
    ])
  );

  const projectIds = [...new Set((regionEmps ?? []).map((e) => e.project_id).filter(Boolean) as string[])];
  const projectTypeMap = new Map<string, PmProjectTypeKey>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, project_type").in("id", projectIds);
    for (const p of projects ?? []) {
      projectTypeMap.set(p.id as string, resolveProjectTypeKey((p.project_type as string) ?? ""));
    }
  }

  const { data: assignedAssets } = await supabase
    .from("assets")
    .select("id, assigned_to_employee_id, category, model, name, specs, status")
    .eq("assigned_by", authUserId)
    .in("status", [...ASSIGNED_STATUSES]);

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
  for (const a of assignedAssets ?? []) {
    const empId = a.assigned_to_employee_id as string | null;
    if (!empId) continue;
    const emp = empById.get(empId);
    if (!emp?.region_id || !allowedRegionSet.has(emp.region_id)) continue;

    const projectType = emp.project_id ? (projectTypeMap.get(emp.project_id) ?? "Other") : "Other";
    const category = ((a.category as string | null) ?? "").trim() || "Other";
    const brand = formatBrandName(rawBrandFromAsset(a));
    scoped.push({
      id: a.id as string,
      employeeId: empId,
      employeeName: emp.full_name,
      projectType,
      category,
      brand,
      label: breakdownLabel(brand, category),
      key: lineKey(brand, category),
    });
  }

  if (scoped.length === 0) return emptyOverview();

  const employeeIds = [...new Set(scoped.map((s) => s.employeeId))];
  const assetIds = scoped.map((s) => s.id);
  const receiptMap = await loadAssetReceiptStatusMap(supabase, employeeIds, assetIds);

  const bucketMaps: Record<PmProjectTypeKey, Map<string, PmAssetBreakdownLine & { assigneeMap: Map<string, PmAssetBreakdownAssignee> }>> = {
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
