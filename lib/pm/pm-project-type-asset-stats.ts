import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAssetReceiptStatusMap } from "@/lib/assets/asset-receipt-status";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { resolveAssignerNames } from "@/lib/users/resolve-assigner-names";

export type PmProjectTypeKey = "MS" | "Rollout" | "Other";

export type PmAssignerSummary = {
  assignerUserId: string | null;
  assignerName: string;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  isYou: boolean;
};

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
  byAssigner: PmAssignerSummary[];
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
  /** Who assigned assets in scope (PM, admin, others). */
  byAssigner: PmAssignerSummary[];
  yourAssignedCount: number;
};

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

type AssetRow = {
  id: string;
  assigned_to_employee_id: string | null;
  assigned_region_id: string | null;
  category: string | null;
  model: string | null;
  name: string | null;
  specs: unknown;
  status: string;
  assigned_by: string | null;
};

type AssignerAgg = {
  assignerUserId: string | null;
  assignerName: string;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  isYou: boolean;
};

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

function assignerAggKey(userId: string | null): string {
  return userId ?? "__unknown__";
}

function emptyBucket(type: PmProjectTypeKey): PmProjectTypeAssetBucket {
  return {
    projectType: type,
    title: type === "MS" ? "MS projects" : type === "Rollout" ? "Rollout projects" : "Other projects",
    totalAssets: 0,
    confirmedCount: 0,
    pendingCount: 0,
    lines: [],
  };
}

function resolveProjectTypeKey(raw: string): PmProjectTypeKey {
  const n = raw.trim().toLowerCase();
  if (!n) return "Other";
  if (n === "rollout" || /\brollout\b/.test(n)) return "Rollout";
  if (n === "ms" || /\bms\b/.test(n)) return "MS";
  return "Other";
}

function mergeReceiptStatus(
  a: PmAssetBreakdownAssignee["receiptStatus"],
  b: PmAssetBreakdownAssignee["receiptStatus"]
): PmAssetBreakdownAssignee["receiptStatus"] {
  if (a === "pending" || b === "pending") return "pending";
  if (a === "none" || b === "none") return "none";
  return "confirmed";
}

function finalizeAssignerMap(map: Map<string, AssignerAgg>): PmAssignerSummary[] {
  return [...map.values()]
    .map((a) => ({
      assignerUserId: a.assignerUserId,
      assignerName: a.assignerName,
      count: a.count,
      confirmedCount: a.confirmedCount,
      pendingCount: a.pendingCount,
      isYou: a.isYou,
    }))
    .sort((a, b) => b.count - a.count || a.assignerName.localeCompare(b.assignerName));
}

function bumpAssigner(
  map: Map<string, AssignerAgg>,
  userId: string | null,
  name: string,
  isYou: boolean,
  receiptStatus: PmAssetBreakdownAssignee["receiptStatus"]
) {
  const key = assignerAggKey(userId);
  let row = map.get(key);
  if (!row) {
    row = {
      assignerUserId: userId,
      assignerName: name,
      count: 0,
      confirmedCount: 0,
      pendingCount: 0,
      isYou,
    };
    map.set(key, row);
  }
  row.count += 1;
  if (receiptStatus === "confirmed") row.confirmedCount += 1;
  else row.pendingCount += 1;
}

function buildBucket(
  type: PmProjectTypeKey,
  map: Map<
    string,
    PmAssetBreakdownLine & {
      assigneeMap: Map<string, PmAssetBreakdownAssignee>;
      assignerMap: Map<string, AssignerAgg>;
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
        byAssigner: finalizeAssignerMap(entry.assignerMap),
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    projectType: type,
    title: type === "MS" ? "MS projects" : type === "Rollout" ? "Rollout projects" : "Other projects",
    totalAssets: lines.reduce((s, l) => s + l.count, 0),
    confirmedCount: lines.reduce((s, l) => s + l.confirmedCount, 0),
    pendingCount: lines.reduce((s, l) => s + l.pendingCount, 0),
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
    byAssigner: [],
    yourAssignedCount: 0,
  };
}

async function loadLatestHistoryByAsset(
  supabase: SupabaseClient,
  assetIds: string[]
): Promise<Map<string, { userId: string; employeeId: string }>> {
  const map = new Map<string, { userId: string; employeeId: string }>();
  if (assetIds.length === 0) return map;

  const { data: rows } = await supabase
    .from("asset_assignment_history")
    .select("asset_id, assigned_by_user_id, to_employee_id, assigned_at")
    .in("asset_id", assetIds)
    .order("assigned_at", { ascending: false })
    .limit(10000);

  for (const row of rows ?? []) {
    const assetId = row.asset_id as string;
    if (!map.has(assetId)) {
      map.set(assetId, {
        userId: row.assigned_by_user_id as string,
        employeeId: row.to_employee_id as string,
      });
    }
  }
  return map;
}

function assetInRegionScope(
  asset: AssetRow,
  employeeRegionId: string | null,
  allowedRegionSet: Set<string>
): boolean {
  if (employeeRegionId && allowedRegionSet.has(employeeRegionId)) return true;
  const ar = asset.assigned_region_id;
  return !!(ar && allowedRegionSet.has(ar));
}

export async function loadPmProjectTypeAssetOverview(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<PmProjectTypeAssetOverview> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, employee, authUserId);
  if (allowedRegionIds.length === 0) return emptyPmProjectTypeAssetOverview();

  const allowedRegionSet = new Set(allowedRegionIds);

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id, full_name, project_id, region_id")
    .in("region_id", allowedRegionIds);

  const regionEmpIds = (regionEmps ?? []).map((e) => e.id as string);

  const assetSelect =
    "id, assigned_to_employee_id, assigned_region_id, category, model, name, specs, status, assigned_by";

  const [byAssigneeRes, byRegionRes] = await Promise.all([
    regionEmpIds.length > 0
      ? supabase
          .from("assets")
          .select(assetSelect)
          .eq("is_ehs_tool", false)
          .in("assigned_to_employee_id", regionEmpIds)
          .in("status", [...ASSIGNED_STATUSES])
      : Promise.resolve({ data: [] as AssetRow[] }),
    supabase
      .from("assets")
      .select(assetSelect)
      .eq("is_ehs_tool", false)
      .in("assigned_region_id", allowedRegionIds)
      .not("assigned_to_employee_id", "is", null)
      .in("status", [...ASSIGNED_STATUSES]),
  ]);

  const assetMap = new Map<string, AssetRow>();
  for (const a of [...(byAssigneeRes.data ?? []), ...(byRegionRes.data ?? [])]) {
    assetMap.set(a.id as string, a as AssetRow);
  }

  const includedAssets = [...assetMap.values()];
  if (includedAssets.length === 0) return emptyPmProjectTypeAssetOverview();

  const assigneeIds = [...new Set(includedAssets.map((a) => a.assigned_to_employee_id).filter(Boolean) as string[])];
  const { data: assignees } = await supabase
    .from("employees")
    .select("id, full_name, project_id, region_id")
    .in("id", assigneeIds);

  const empById = new Map(
    (assignees ?? []).map((e) => [
      e.id as string,
      {
        id: e.id as string,
        full_name: (e.full_name as string | null) ?? "—",
        project_id: e.project_id as string | null,
        region_id: e.region_id as string | null,
      },
    ])
  );

  const nullAssignerAssetIds = includedAssets.filter((a) => !a.assigned_by).map((a) => a.id);
  const historyByAsset = await loadLatestHistoryByAsset(supabase, nullAssignerAssetIds);

  const assignerUserIds = new Set<string>();
  for (const a of includedAssets) {
    if (a.assigned_by) assignerUserIds.add(a.assigned_by);
    else {
      const h = historyByAsset.get(a.id);
      if (h?.userId) assignerUserIds.add(h.userId);
    }
  }
  const assignerNameMap = await resolveAssignerNames(supabase, [...assignerUserIds]);

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
    assignerUserId: string | null;
    assignerName: string;
    isYou: boolean;
  };

  const scoped: ScopedAsset[] = [];
  for (const a of includedAssets) {
    const empId = a.assigned_to_employee_id as string | null;
    if (!empId) continue;
    const emp = empById.get(empId);
    if (!emp) continue;
    if (!assetInRegionScope(a, emp.region_id, allowedRegionSet)) continue;

    let assignerUserId = a.assigned_by;
    if (!assignerUserId) {
      const hist = historyByAsset.get(a.id);
      if (hist && hist.employeeId === empId) assignerUserId = hist.userId;
    }
    const assignerName = assignerUserId
      ? assignerNameMap.get(assignerUserId) ?? "Unknown user"
      : "Unknown assigner";
    const isYou = !!(authUserId && assignerUserId === authUserId);

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
      assignerUserId,
      assignerName,
      isYou,
    });
  }

  if (scoped.length === 0) return emptyPmProjectTypeAssetOverview();

  const receiptMap = await loadAssetReceiptStatusMap(
    supabase,
    [...new Set(scoped.map((s) => s.employeeId))],
    scoped.map((s) => s.id)
  );

  const grandAssignerMap = new Map<string, AssignerAgg>();
  const bucketMaps: Record<
    PmProjectTypeKey,
    Map<
      string,
      PmAssetBreakdownLine & {
        assigneeMap: Map<string, PmAssetBreakdownAssignee>;
        assignerMap: Map<string, AssignerAgg>;
      }
    >
  > = {
    MS: new Map(),
    Rollout: new Map(),
    Other: new Map(),
  };

  for (const item of scoped) {
    const receipt = receiptMap.get(`${item.employeeId}:${item.id}`);
    const receiptStatus: PmAssetBreakdownAssignee["receiptStatus"] =
      receipt === "confirmed" ? "confirmed" : receipt === "pending" ? "pending" : "none";

    bumpAssigner(grandAssignerMap, item.assignerUserId, item.assignerName, item.isYou, receiptStatus);

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
        byAssigner: [],
        assigneeMap: new Map(),
        assignerMap: new Map(),
      };
      map.set(item.key, line);
    }

    line.count += 1;
    if (receiptStatus === "confirmed") line.confirmedCount += 1;
    else line.pendingCount += 1;

    bumpAssigner(line.assignerMap, item.assignerUserId, item.assignerName, item.isYou, receiptStatus);

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
  const byAssigner = finalizeAssignerMap(grandAssignerMap);
  const yourAssignedCount = byAssigner.find((a) => a.isYou)?.count ?? 0;

  return {
    ms,
    rollout,
    other,
    grandTotal: ms.totalAssets + rollout.totalAssets + other.totalAssets,
    grandConfirmed: ms.confirmedCount + rollout.confirmedCount + other.confirmedCount,
    grandPending: ms.pendingCount + rollout.pendingCount + other.pendingCount,
    byAssigner,
    yourAssignedCount,
  };
}

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
