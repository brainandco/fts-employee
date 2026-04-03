import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LeaveRequestForm } from "./LeaveRequestForm";

export default async function LeavePage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
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
        <p className="mt-1 text-zinc-600">Apply for leave. Requests are sent to your PM and admin for approval.</p>
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
              const payload = (a.payload_json as { from_date?: string; to_date?: string; reason?: string }) ?? {};
              const isApproved = a.status === "Admin_Approved" || a.status === "Completed";
              const isRejected = a.status === "Admin_Rejected" || a.status === "PM_Rejected";
              return (
                <li
                  key={a.id}
                  className={`rounded-lg border p-4 ${
                    isApproved ? "border-emerald-200 bg-emerald-50/50" : isRejected ? "border-red-200 bg-red-50/50" : "border-zinc-200 bg-zinc-50/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">
                      {payload.from_date ?? "—"} to {payload.to_date ?? "—"}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        isApproved ? "bg-emerald-100 text-emerald-800" : isRejected ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {payload.reason && <p className="mt-1 text-sm text-zinc-600">Reason: {payload.reason}</p>}
                  {(a.admin_comment || a.pm_comment) && (
                    <p className="mt-2 text-sm text-zinc-500">
                      {a.pm_comment && <>PM: {a.pm_comment}</>}
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
        <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">← Back to dashboard</Link>
      </p>
    </div>
  );
}
