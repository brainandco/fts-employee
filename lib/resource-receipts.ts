import type { SupabaseClient } from "@supabase/supabase-js";

export type ResourceReceiptType = "asset" | "sim_card" | "vehicle";

/** Create or replace a pending receipt when a resource is assigned to an employee. */
export async function upsertPendingReceipt(
  supabase: SupabaseClient,
  input: {
    employeeId: string;
    assignedByUserId: string | null;
    resourceType: ResourceReceiptType;
    resourceId: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("resource_receipt_confirmations").upsert(
    {
      employee_id: input.employeeId,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      status: "pending",
      confirmation_message: null,
      assigned_by_user_id: input.assignedByUserId,
      assigned_at: now,
      confirmed_at: null,
    },
    { onConflict: "resource_type,resource_id" }
  );
  if (error) throw error;
}

export async function upsertPendingReceipts(
  supabase: SupabaseClient,
  input: {
    employeeId: string;
    assignedByUserId: string | null;
    items: { resourceType: ResourceReceiptType; resourceId: string }[];
  }
): Promise<void> {
  for (const item of input.items) {
    await upsertPendingReceipt(supabase, {
      employeeId: input.employeeId,
      assignedByUserId: input.assignedByUserId,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
    });
  }
}

/** Remove receipt row when a resource is unassigned (pool). */
export async function deleteReceiptForResource(
  supabase: SupabaseClient,
  resourceType: ResourceReceiptType,
  resourceId: string
): Promise<void> {
  await supabase.from("resource_receipt_confirmations").delete().eq("resource_type", resourceType).eq("resource_id", resourceId);
}
