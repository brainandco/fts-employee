import type { SupabaseClient } from "@supabase/supabase-js";
import { inclusiveCalendarDays } from "@/lib/employee-requests/leave-metrics";

/** One calendar day of Sick or Casual does not require returning assets first. */
const ONE_DAY_ASSET_EXEMPT = new Set(["sick", "casual"]);

export function isOneDaySickOrCasualLeave(leaveType: string, fromIso: string, toIso: string): boolean {
  if (inclusiveCalendarDays(fromIso, toIso) !== 1) return false;
  const t = leaveType.trim().toLowerCase();
  return ONE_DAY_ASSET_EXEMPT.has(t);
}

/**
 * For leave other than a single-day Sick/Casual request, the employee must have no assets or SIM cards
 * still assigned to them before submitting leave.
 */
export async function assertAssignedAssetsReturnedIfRequired(
  supabase: SupabaseClient,
  employeeId: string,
  leaveType: string,
  fromIso: string,
  toIso: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (isOneDaySickOrCasualLeave(leaveType, fromIso, toIso)) {
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

  if (assetCount === 0 && simCount === 0) return { ok: true };

  const parts: string[] = [];
  if (assetCount) parts.push(`${assetCount} asset${assetCount === 1 ? "" : "s"}`);
  if (simCount) parts.push(`${simCount} SIM card${simCount === 1 ? "" : "s"}`);
  return {
    ok: false,
    message: `Return all assigned ${parts.join(
      " and "
    )} before applying for this leave (single-day Sick or Casual only are exempt). Use asset returns in the portal or contact your administrator.`,
  };
}
