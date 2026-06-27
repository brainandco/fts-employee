import type { SupabaseClient } from "@supabase/supabase-js";

export type AssetReceiptStatus = "pending" | "confirmed";

/** Map key: `${employeeId}:${assetId}` → receipt status */
export async function loadAssetReceiptStatusMap(
  supabase: SupabaseClient,
  employeeIds: string[],
  assetIds: string[]
): Promise<Map<string, AssetReceiptStatus>> {
  return loadResourceReceiptStatusMap(supabase, "asset", employeeIds, assetIds);
}

/** Map key: `${employeeId}:${simId}` → receipt status */
export async function loadSimReceiptStatusMap(
  supabase: SupabaseClient,
  employeeIds: string[],
  simIds: string[]
): Promise<Map<string, AssetReceiptStatus>> {
  return loadResourceReceiptStatusMap(supabase, "sim_card", employeeIds, simIds);
}

async function loadResourceReceiptStatusMap(
  supabase: SupabaseClient,
  resourceType: "asset" | "sim_card",
  employeeIds: string[],
  resourceIds: string[]
): Promise<Map<string, AssetReceiptStatus>> {
  const map = new Map<string, AssetReceiptStatus>();
  if (employeeIds.length === 0 || resourceIds.length === 0) return map;

  const { data: rows } = await supabase
    .from("resource_receipt_confirmations")
    .select("employee_id, resource_id, status")
    .eq("resource_type", resourceType)
    .in("employee_id", employeeIds)
    .in("resource_id", resourceIds);

  for (const row of rows ?? []) {
    const status = row.status === "confirmed" ? "confirmed" : row.status === "pending" ? "pending" : null;
    if (!status) continue;
    map.set(`${row.employee_id}:${row.resource_id}`, status);
  }

  return map;
}
