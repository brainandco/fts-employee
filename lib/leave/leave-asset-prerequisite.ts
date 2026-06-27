import type { SupabaseClient } from "@supabase/supabase-js";
import { isShortLeaveExemptFromAssetReturn } from "@/lib/leave/leave-types";

/** API + client use this to show the asset-prerequisite education modal instead of a raw error line. */
export const LEAVE_ASSIGNED_ITEMS_NOT_RETURNED = "LEAVE_ASSIGNED_ITEMS_NOT_RETURNED" as const;

/** Returns submitted but PM (or Admin for PM staff) has not confirmed yet. */
export const LEAVE_PENDING_RETURN_CONFIRMATION = "LEAVE_PENDING_RETURN_CONFIRMATION" as const;

export type AssignedItemsPrerequisiteResult =
  | { ok: true }
  | { ok: false; message: string }
  | {
      ok: false;
      code: typeof LEAVE_ASSIGNED_ITEMS_NOT_RETURNED;
      message: string;
      assetCount: number;
      simCount: number;
      vehicleCount: number;
    }
  | {
      ok: false;
      code: typeof LEAVE_PENDING_RETURN_CONFIRMATION;
      message: string;
      pendingReturnCount: number;
    };

export { isShortLeaveExemptFromAssetReturn, isOneDaySickOrCasualLeave } from "@/lib/leave/leave-types";

/**
 * For leave other than a single-day Sick/Casual/Emergency request, the employee must:
 * - have no assets, SIMs, or vehicles still assigned;
 * - have no asset returns awaiting PM/Admin confirmation.
 */
export async function assertAssignedAssetsReturnedIfRequired(
  supabase: SupabaseClient,
  employeeId: string,
  leaveType: string,
  fromIso: string,
  toIso: string
): Promise<AssignedItemsPrerequisiteResult> {
  if (isShortLeaveExemptFromAssetReturn(leaveType, fromIso, toIso)) {
    return { ok: true };
  }

  const { data: assets, error: aErr } = await supabase
    .from("assets")
    .select("id")
    .eq("assigned_to_employee_id", employeeId)
    .eq("status", "Assigned");
  if (aErr) return { ok: false, message: aErr.message };
  const assetCount = (assets ?? []).length;

  const { data: sims, error: sErr } = await supabase
    .from("sim_cards")
    .select("id")
    .eq("assigned_to_employee_id", employeeId)
    .eq("status", "Assigned");
  if (sErr) return { ok: false, message: sErr.message };
  const simCount = (sims ?? []).length;

  const { data: vehicles, error: vErr } = await supabase
    .from("vehicle_assignments")
    .select("vehicle_id")
    .eq("employee_id", employeeId);
  if (vErr) return { ok: false, message: vErr.message };
  const vehicleCount = (vehicles ?? []).length;

  const { data: pendingReturns, error: pErr } = await supabase
    .from("asset_return_requests")
    .select("id")
    .eq("from_employee_id", employeeId)
    .eq("status", "pending");
  if (pErr) return { ok: false, message: pErr.message };
  const pendingReturnCount = (pendingReturns ?? []).length;

  if (pendingReturnCount > 0) {
    return {
      ok: false,
      code: LEAVE_PENDING_RETURN_CONFIRMATION,
      message: `You have ${pendingReturnCount} asset return${pendingReturnCount === 1 ? "" : "s"} waiting for PM confirmation. Leave can only be submitted after your returns are confirmed.`,
      pendingReturnCount,
    };
  }

  if (assetCount === 0 && simCount === 0 && vehicleCount === 0) return { ok: true };

  const parts: string[] = [];
  if (assetCount) parts.push(`${assetCount} asset${assetCount === 1 ? "" : "s"}`);
  if (simCount) parts.push(`${simCount} SIM card${simCount === 1 ? "" : "s"}`);
  if (vehicleCount) parts.push(`${vehicleCount} vehicle${vehicleCount === 1 ? "" : "s"}`);
  return {
    ok: false,
    code: LEAVE_ASSIGNED_ITEMS_NOT_RETURNED,
    message: `Return all assigned ${parts.join(
      ", "
    )} before applying for this leave. Single-day Sick, Casual, or Emergency leave is exempt. After you submit returns, wait for PM confirmation before applying.`,
    assetCount,
    simCount,
    vehicleCount,
  };
}
