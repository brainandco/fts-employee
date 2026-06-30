import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import {
  loadPmProjectTypeAssetOverview,
  pmOverviewToCategoryCounts,
  emptyPmProjectTypeAssetOverview,
  type PmProjectTypeAssetOverview,
} from "@/lib/pm/pm-project-type-asset-stats";

export type PmAssetCategoryCount = { category: string; count: number };

export type PmRegionStats = {
  scopeLabel: string;
  employeeCount: number;
  assignedAssetCount: number;
  assignedAssetConfirmedCount: number;
  assignedAssetPendingCount: number;
  assetsByCategory: PmAssetCategoryCount[];
  assignmentOverview: PmProjectTypeAssetOverview;
  pendingAssetReturns: number;
  pendingQcRequests: number;
};

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
      assignedAssetConfirmedCount: 0,
      assignedAssetPendingCount: 0,
      assetsByCategory: [],
      assignmentOverview: emptyPmProjectTypeAssetOverview(),
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

  const overview = await loadPmProjectTypeAssetOverview(supabase, employee, authUserId);
  const assignedAssetCount = overview.grandTotal;
  const assignedAssetConfirmedCount = overview.grandConfirmed;
  const assignedAssetPendingCount = overview.grandPending;
  const assetsByCategory = pmOverviewToCategoryCounts(overview);

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
    assignedAssetConfirmedCount,
    assignedAssetPendingCount,
    assetsByCategory,
    assignmentOverview: overview,
    pendingAssetReturns,
    pendingQcRequests,
  };
}
