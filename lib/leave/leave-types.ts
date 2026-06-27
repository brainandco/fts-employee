import { inclusiveCalendarDays } from "@/lib/employee-requests/leave-metrics";

/** Shared leave type list for employee portal and mobile. */
export const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Casual",
  "Emergency",
  "Unpaid",
  "Marriage",
  "Bereavement",
  "Maternity",
  "Hajj / Umrah",
  "Other",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

/** Single calendar day of Sick, Casual, or Emergency — no asset return required. */
const ONE_DAY_ASSET_EXEMPT = new Set(["sick", "casual", "emergency"]);

export function isShortLeaveExemptFromAssetReturn(
  leaveType: string,
  fromIso: string,
  toIso: string
): boolean {
  if (inclusiveCalendarDays(fromIso, toIso) !== 1) return false;
  const t = leaveType.trim().toLowerCase();
  return ONE_DAY_ASSET_EXEMPT.has(t);
}

/** @deprecated Use isShortLeaveExemptFromAssetReturn */
export function isOneDaySickOrCasualLeave(leaveType: string, fromIso: string, toIso: string): boolean {
  return isShortLeaveExemptFromAssetReturn(leaveType, fromIso, toIso);
}
