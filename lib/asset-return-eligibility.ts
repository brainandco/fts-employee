/**
 * Asset is still in the employee's custody and they may start a portal return.
 * Excludes Pending_Return (already in return workflow) and Available.
 * With_QC: asset held by QC for inspection/handover (same return flow as Assigned).
 */
const RETURNABLE = new Set(["Assigned", "Under_Maintenance", "Damaged", "With_QC"]);

export function canEmployeeInitiateAssetReturn(status: string | null | undefined): boolean {
  if (!status) return false;
  return RETURNABLE.has(status);
}
