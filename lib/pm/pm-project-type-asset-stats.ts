import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";

export type PmAssetBreakdownLine = {
  category: string;
  model: string | null;
  label: string;
  count: number;
};

export type PmProjectTypeAssetBucket = {
  projectType: "MS" | "Rollout";
  title: string;
  totalAssets: number;
  lines: PmAssetBreakdownLine[];
};

export type PmProjectTypeAssetOverview = {
  ms: PmProjectTypeAssetBucket;
  rollout: PmProjectTypeAssetBucket;
};

const ASSIGNED_STATUSES = ["Assigned", "With_QC", "Under_Maintenance", "Damaged"] as const;

function breakdownLabel(category: string, model: string | null): string {
  const cat = category.trim() || "Other";
  const mod = (model ?? "").trim();
  if (mod) return `${mod} · ${cat}`;
  return cat;
}

function bucketKey(category: string, model: string | null): string {
  return `${(model ?? "").trim().toLowerCase()}|${(category ?? "").trim().toLowerCase() || "other"}`;
}

function emptyBucket(type: "MS" | "Rollout"): PmProjectTypeAssetBucket {
  return {
    projectType: type,
    title: type === "MS" ? "MS projects" : "Rollout projects",
    totalAssets: 0,
    lines: [],
  };
}

function buildBucket(type: "MS" | "Rollout", total: number, map: Map<string, PmAssetBreakdownLine>): PmProjectTypeAssetBucket {
  const lines = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    projectType: type,
    title: type === "MS" ? "MS projects" : "Rollout projects",
    totalAssets: total,
    lines,
  };
}

export async function loadPmProjectTypeAssetOverview(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<PmProjectTypeAssetOverview> {
  if (!authUserId) {
    return { ms: emptyBucket("MS"), rollout: emptyBucket("Rollout") };
  }

  const { allowedRegionIds } = await loadPmScopeIds(supabase, employee, authUserId);
  if (allowedRegionIds.length === 0) {
    return { ms: emptyBucket("MS"), rollout: emptyBucket("Rollout") };
  }

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id, project_id")
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE");

  const empList = regionEmps ?? [];
  const regionEmpIds = empList.map((e) => e.id as string);
  if (regionEmpIds.length === 0) {
    return { ms: emptyBucket("MS"), rollout: emptyBucket("Rollout") };
  }

  const projectIds = [...new Set(empList.map((e) => e.project_id).filter(Boolean) as string[])];
  const projectTypeMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects } = await supabase.from("projects").select("id, project_type").in("id", projectIds);
    for (const p of projects ?? []) {
      projectTypeMap.set(p.id as string, (p.project_type as string) ?? "");
    }
  }

  const empProjectType = new Map<string, "MS" | "Rollout" | null>();
  for (const e of empList) {
    const pid = e.project_id as string | null;
    const raw = pid ? (projectTypeMap.get(pid) ?? "") : "";
    const normalized = raw.trim().toLowerCase();
    if (normalized === "ms") empProjectType.set(e.id as string, "MS");
    else if (normalized === "rollout") empProjectType.set(e.id as string, "Rollout");
    else empProjectType.set(e.id as string, null);
  }

  const { data: assignedAssets } = await supabase
    .from("assets")
    .select("assigned_to_employee_id, category, model")
    .in("assigned_to_employee_id", regionEmpIds)
    .eq("assigned_by", authUserId)
    .in("status", [...ASSIGNED_STATUSES]);

  const buckets: Record<"MS" | "Rollout", Map<string, PmAssetBreakdownLine>> = {
    MS: new Map(),
    Rollout: new Map(),
  };
  const totals: Record<"MS" | "Rollout", number> = { MS: 0, Rollout: 0 };

  for (const a of assignedAssets ?? []) {
    const empId = a.assigned_to_employee_id as string | null;
    if (!empId) continue;
    const pt = empProjectType.get(empId);
    if (!pt) continue;

    totals[pt] += 1;
    const category = ((a.category as string | null) ?? "").trim() || "Other";
    const model = ((a.model as string | null) ?? "").trim() || null;
    const key = bucketKey(category, model);
    const map = buckets[pt];
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { category, model, label: breakdownLabel(category, model), count: 1 });
  }

  return {
    ms: buildBucket("MS", totals.MS, buckets.MS),
    rollout: buildBucket("Rollout", totals.Rollout, buckets.Rollout),
  };
}
