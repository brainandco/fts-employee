import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LeaveRequestForm } from "./LeaveRequestForm";
import { LeavePerformaUpload } from "./LeavePerformaUpload";

type LeavePayload = {
  from_date?: string;
  to_date?: string;
  reason?: string;
  leave_type?: string;
  guarantor_display_name?: string;
  filled_performa_pdf_url?: string;
};

function statusBadgeClass(status: string): string {
  if (status === "Completed") return "bg-emerald-100 text-emerald-800";
  if (status === "Admin_Rejected" || status === "PM_Rejected") return "bg-red-100 text-red-800";
  if (status === "Awaiting_Signed_Performa") return "bg-sky-100 text-sky-900";
  if (status === "Performa_Submitted") return "bg-violet-100 text-violet-900";
  return "bg-amber-100 text-amber-800";
}

function statusBorderClass(status: string): string {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50/50";
  if (status === "Admin_Rejected" || status === "PM_Rejected") return "border-red-200 bg-red-50/50";
  if (status === "Awaiting_Signed_Performa") return "border-sky-200 bg-sky-50/40";
  if (status === "Performa_Submitted") return "border-violet-200 bg-violet-50/40";
  return "border-zinc-200 bg-zinc-50/30";
}

export default async function LeavePage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return null;

  const supabase = await getDataClient();
  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, approval_type, status, created_at, payload_json, admin_comment, pm_comment")
    .eq("requester_id", session.user.id)
    .eq("approval_type", "leave_request")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Leave</h1>
        <p className="mt-1 text-zinc-600">
          Apply with a guarantor from your region and a leave type. An admin reviews first and sends a filled performa PDF;
          after you sign and upload it, a super user gives final approval.
        </p>
      </div>

      <section className="rounded-2xl border border-violet-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Apply for leave</h2>
        <LeaveRequestForm />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">My leave requests</h2>
        {!approvals?.length ? (
          <p className="mt-2 text-sm text-zinc-500">No leave requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {approvals.map((a) => {
              const payload = (a.payload_json as LeavePayload) ?? {};
              const pdfUrl = payload.filled_performa_pdf_url?.trim();
              return (
                <li key={a.id} className={`rounded-lg border p-4 ${statusBorderClass(a.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">
                      {payload.from_date ?? "—"} to {payload.to_date ?? "—"}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(a.status)}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {payload.leave_type ? (
                    <p className="mt-1 text-sm text-zinc-600">Type: {payload.leave_type}</p>
                  ) : null}
                  {payload.guarantor_display_name ? (
                    <p className="mt-0.5 text-sm text-zinc-600">Guarantor: {payload.guarantor_display_name}</p>
                  ) : null}
                  {payload.reason ? <p className="mt-1 text-sm text-zinc-600">Reason: {payload.reason}</p> : null}
                  {a.status === "Awaiting_Signed_Performa" && pdfUrl ? (
                    <LeavePerformaUpload approvalId={a.id} pdfUrl={pdfUrl} />
                  ) : null}
                  {a.status === "Performa_Submitted" ? (
                    <p className="mt-2 text-sm text-violet-800">
                      Signed performa received — waiting for super user final approval.
                    </p>
                  ) : null}
                  {a.status === "Submitted" ? (
                    <p className="mt-2 text-xs text-zinc-500">Waiting for admin review.</p>
                  ) : null}
                  {(a.admin_comment || a.pm_comment) && (
                    <p className="mt-2 text-sm text-zinc-500">
                      {a.pm_comment && <>Final / GM: {a.pm_comment}</>}
                      {a.pm_comment && a.admin_comment && " · "}
                      {a.admin_comment && <>Admin: {a.admin_comment}</>}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-500">Submitted: {new Date(a.created_at).toLocaleString()}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p>
        <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
