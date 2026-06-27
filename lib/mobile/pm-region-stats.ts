import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";

export type PmAssetCategoryCount = { category: string; count: number };

export type PmRegionStats = {
  scopeLabel: string;
  employeeCount: number;
  assignedAssetCount: number;
  assetsByCategory: PmAssetCategoryCount[];
  pendingAssetReturns: number;
  pendingQcRequests: number;
};

const ASSIGNED_STATUSES = ["Assigned", "With_QC", "Under_Maintenance", "Damaged"] as const;

export async function loadPmRegionStats(
  supabase: SupabaseClient,
  employee: { id: string; region_id: string | null; project_id: string | null },
  authUserId: string
): Promise<PmRegionStats | null> {
  const { allowedRegionIds } = await loadPmScopeIds(supabase, employee, authUserId);
  if (allowedRegionIds.length === 0) {
    return {
      scopeLabel: "No region scope",
      employeeCount: 0,
      assignedAssetCount: 0,
      assetsByCategory: [],
      pendingAssetReturns: 0,
      pendingQcRequests: 0,
    };
  }

  const { count: empCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE");

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id")
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE");
  const regionEmpIds = (regionEmps ?? []).map((e) => e.id as string);

  let assignedAssetCount = 0;
  const categoryMap = new Map<string, number>();

  if (regionEmpIds.length > 0) {
    const { data: assignedAssets } = await supabase
      .from("assets")
      .select("category")
      .in("assigned_to_employee_id", regionEmpIds)
      .in("status", [...ASSIGNED_STATUSES]);

    assignedAssetCount = (assignedAssets ?? []).length;
    for (const a of assignedAssets ?? []) {
      const cat = ((a.category as string | null) ?? "").trim() || "Other";
      categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
    }
  }

  const assetsByCategory = [...categoryMap.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  let pendingAssetReturns = 0;
  if (allowedRegionIds.length > 0) {
    let returnsQuery = supabase
      .from("asset_return_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    returnsQuery =
      allowedRegionIds.length === 1
        ? returnsQuery.eq("region_id", allowedRegionIds[0]!)
        : returnsQuery.in("region_id", allowedRegionIds);
    const { count } = await returnsQuery;
    pendingAssetReturns = count ?? 0;
  }

  let pendingQcRequests = 0;
  if (regionEmpIds.length > 0) {
    const { data: qcRows } = await supabase
      .from("asset_replacement_requests")
      .select("for_employee_id, status")
      .eq("status", "Pending");
    const regionEmpSet = new Set(regionEmpIds);
    pendingQcRequests = (qcRows ?? []).filter((r) => regionEmpSet.has(r.for_employee_id as string)).length;
  }

  const { data: regionRows } = await supabase.from("regions").select("name").in("id", allowedRegionIds).order("name");
  const names = (regionRows ?? []).map((r) => r.name as string).filter(Boolean);
  const scopeLabel =
    names.length === 0
      ? "Your regions"
      : names.length === 1
        ? names[0]!
        : `${names.length} regions (${names.join(", ")})`;

  return {
    scopeLabel,
    employeeCount: empCount ?? 0,
    assignedAssetCount,
    assetsByCategory,
    pendingAssetReturns,
    pendingQcRequests,
  };
}
