import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteReceiptForResource } from "@/lib/resource-receipts";

const UNASSIGNABLE_STATUSES = ["Assigned", "With_QC", "Under_Maintenance", "Damaged"] as const;

export type BulkUnassignScope =
  | { mode: "all" }
  | { mode: "regions"; regionIds: string[] };

export type BulkUnassignResult = {
  unassignedCount: number;
  assetIds: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type AssetRow = { id: string; assigned_to_employee_id: string | null };

/** Assets still held by an employee (excludes Pending_Return — already unassigned). */
export async function fetchAssetIdsForBulkUnassign(
  supabase: SupabaseClient,
  scope: BulkUnassignScope
): Promise<AssetRow[]> {
  if (scope.mode === "all") {
    const { data, error } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id")
      .not("assigned_to_employee_id", "is", null)
      .in("status", [...UNASSIGNABLE_STATUSES]);
    if (error) throw error;
    return (data ?? []) as AssetRow[];
  }

  const regionIds = [...new Set(scope.regionIds.filter(Boolean))];
  if (regionIds.length === 0) return [];

  const seen = new Set<string>();
  const rows: AssetRow[] = [];

  const { data: emps } = await supabase.from("employees").select("id").in("region_id", regionIds);
  const empIds = (emps ?? []).map((e) => e.id as string).filter(Boolean);

  for (const part of chunk(empIds, 80)) {
    const { data, error } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id")
      .in("assigned_to_employee_id", part)
      .in("status", [...UNASSIGNABLE_STATUSES]);
    if (error) throw error;
    for (const r of data ?? []) {
      const id = r.id as string;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push(r as AssetRow);
      }
    }
  }

  for (const part of chunk(regionIds, 20)) {
    const { data, error } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id")
      .in("assigned_region_id", part)
      .not("assigned_to_employee_id", "is", null)
      .in("status", [...UNASSIGNABLE_STATUSES]);
    if (error) throw error;
    for (const r of data ?? []) {
      const id = r.id as string;
      if (!seen.has(id)) {
        seen.add(id);
        rows.push(r as AssetRow);
      }
    }
  }

  return rows;
}

export async function bulkUnassignAssets(
  supabase: SupabaseClient,
  scope: BulkUnassignScope
): Promise<BulkUnassignResult> {
  const targets = await fetchAssetIdsForBulkUnassign(supabase, scope);
  const assetIds = targets.map((t) => t.id);
  if (assetIds.length === 0) return { unassignedCount: 0, assetIds: [] };

  for (const part of chunk(assetIds, 100)) {
    const { error } = await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: null,
        assigned_by: null,
        assigned_at: null,
        status: "Available",
      })
      .in("id", part);
    if (error) throw error;
  }

  for (const id of assetIds) {
    await deleteReceiptForResource(supabase, "asset", id);
  }

  return { unassignedCount: assetIds.length, assetIds };
}

export async function countAssetsForBulkUnassign(
  supabase: SupabaseClient,
  scope: BulkUnassignScope
): Promise<number> {
  const rows = await fetchAssetIdsForBulkUnassign(supabase, scope);
  return rows.length;
}
