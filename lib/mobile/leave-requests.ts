type LeavePayload = {
  from_date?: string;
  to_date?: string;
  reason?: string;
  leave_type?: string;
  requester_job_title?: string;
  filled_performa_pdf_url?: string;
  admin_leave_request?: boolean;
};

export type MobileLeaveRequestItem = {
  id: string;
  status: string;
  createdAt: string;
  fromDate: string | null;
  toDate: string | null;
  leaveType: string | null;
  reason: string | null;
  jobTitle: string | null;
  filledPerformaPdfUrl: string | null;
  adminLeaveRequest: boolean;
  adminComment: string | null;
  pmComment: string | null;
};

export function mapLeaveApprovalRow(a: {
  id: string;
  status: string;
  created_at: string;
  payload_json: unknown;
  admin_comment?: string | null;
  pm_comment?: string | null;
}): MobileLeaveRequestItem {
  const payload = (a.payload_json as LeavePayload) ?? {};
  return {
    id: a.id,
    status: a.status,
    createdAt: a.created_at,
    fromDate: payload.from_date ?? null,
    toDate: payload.to_date ?? null,
    leaveType: payload.leave_type ?? null,
    reason: payload.reason ?? null,
    jobTitle: payload.requester_job_title ?? null,
    filledPerformaPdfUrl: payload.filled_performa_pdf_url?.trim() || null,
    adminLeaveRequest: !!payload.admin_leave_request,
    adminComment: a.admin_comment ?? null,
    pmComment: a.pm_comment ?? null,
  };
}

/** Active leave — not finally completed or rejected. */
export function isPendingLeaveStatus(status: string): boolean {
  return (
    status !== "Completed" &&
    status !== "Admin_Rejected" &&
    status !== "PM_Rejected"
  );
}

export function isActionNeededLeave(item: MobileLeaveRequestItem): boolean {
  return item.status === "Awaiting_Signed_Performa" && !!item.filledPerformaPdfUrl;
}
