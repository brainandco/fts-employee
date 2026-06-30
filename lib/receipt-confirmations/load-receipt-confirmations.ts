import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAssignerNames } from "@/lib/users/resolve-assigner-names";

export type ReceiptConfirmationDisplay = {
  id: string;
  status: string;
  typeLabel: string;
  resourceLabel: string;
  employeeName: string;
  assignedAt: string | null;
  confirmedAt: string | null;
  confirmationMessage: string | null;
  assignerName: string;
  receiptPhotoUrls: string[];
  resourceType: string;
};

type ReceiptRow = {
  id: string;
  employee_id: string;
  resource_type: string;
  resource_id: string;
  status: string;
  confirmation_message: string | null;
  assigned_at: string;
  confirmed_at: string | null;
  assigned_by_user_id: string | null;
  receipt_image_urls?: unknown;
};

function receiptPhotoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/** Load receipt confirmations, optionally limited to assignees in `scopeEmployeeIds`. */
export async function loadReceiptConfirmationsForScope(
  supabase: SupabaseClient,
  scopeEmployeeIds: string[] | null
): Promise<ReceiptConfirmationDisplay[]> {
  let query = supabase
    .from("resource_receipt_confirmations")
    .select(
      "id, employee_id, resource_type, resource_id, status, confirmation_message, assigned_at, confirmed_at, assigned_by_user_id, receipt_image_urls"
    )
    .order("assigned_at", { ascending: false })
    .limit(500);

  if (scopeEmployeeIds !== null) {
    if (scopeEmployeeIds.length === 0) return [];
    query = query.in("employee_id", scopeEmployeeIds);
  }

  const { data: rows } = await query;
  const list = (rows ?? []) as ReceiptRow[];
  if (list.length === 0) return [];

  const empIds = [...new Set(list.map((r) => r.employee_id))];
  const userIds = [...new Set(list.map((r) => r.assigned_by_user_id).filter(Boolean) as string[])];

  const [{ data: employees }, assignerMap] = await Promise.all([
    supabase.from("employees").select("id, full_name").in("id", empIds),
    resolveAssignerNames(supabase, userIds),
  ]);

  const empMap = new Map((employees ?? []).map((e) => [e.id as string, (e.full_name as string) ?? "—"]));

  const assetIds = list.filter((r) => r.resource_type === "asset").map((r) => r.resource_id);
  const simIds = list.filter((r) => r.resource_type === "sim_card").map((r) => r.resource_id);
  const vehicleIds = list.filter((r) => r.resource_type === "vehicle").map((r) => r.resource_id);

  const [assetsRes, simsRes, vehiclesRes] = await Promise.all([
    assetIds.length ? supabase.from("assets").select("id, name, serial, category").in("id", assetIds) : { data: [] },
    simIds.length ? supabase.from("sim_cards").select("id, sim_number").in("id", simIds) : { data: [] },
    vehicleIds.length ? supabase.from("vehicles").select("id, plate_number").in("id", vehicleIds) : { data: [] },
  ]);

  const assetMap = new Map((assetsRes.data ?? []).map((a) => [a.id as string, a]));
  const simMap = new Map((simsRes.data ?? []).map((s) => [s.id as string, s]));
  const vehicleMap = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v]));

  function resourceLabel(r: ReceiptRow): string {
    if (r.resource_type === "asset") {
      const a = assetMap.get(r.resource_id) as { name?: string | null; serial?: string | null } | undefined;
      if (!a) return r.resource_id;
      const n = typeof a.name === "string" && a.name.trim() ? a.name.trim() : "";
      if (n) return n;
      return a.serial ? String(a.serial) : r.resource_id;
    }
    if (r.resource_type === "sim_card") {
      const s = simMap.get(r.resource_id);
      return s ? String(s.sim_number) : r.resource_id;
    }
    const v = vehicleMap.get(r.resource_id);
    return v ? String(v.plate_number) : r.resource_id;
  }

  function typeLabel(r: ReceiptRow): string {
    if (r.resource_type === "asset") {
      const a = assetMap.get(r.resource_id) as { category?: string | null } | undefined;
      const c = typeof a?.category === "string" && a.category.trim() ? a.category.trim() : "";
      return c || "Asset";
    }
    if (r.resource_type === "sim_card") return "SIM";
    return "Vehicle";
  }

  return list.map((r) => ({
    id: r.id,
    status: r.status,
    typeLabel: typeLabel(r),
    resourceLabel: resourceLabel(r),
    employeeName: empMap.get(r.employee_id) ?? r.employee_id,
    assignedAt: r.assigned_at,
    confirmedAt: r.confirmed_at,
    confirmationMessage: r.confirmation_message,
    assignerName: r.assigned_by_user_id ? assignerMap.get(r.assigned_by_user_id) ?? "—" : "—",
    receiptPhotoUrls: receiptPhotoUrls(r.receipt_image_urls),
    resourceType: r.resource_type,
  }));
}

/** Employee ids in the given regions (primary region on employees row). */
export async function loadEmployeeIdsInRegions(
  supabase: SupabaseClient,
  regionIds: string[]
): Promise<string[]> {
  if (regionIds.length === 0) return [];
  const { data } = await supabase.from("employees").select("id").in("region_id", regionIds).eq("status", "ACTIVE");
  return (data ?? []).map((e) => e.id as string);
}
