import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { hasReportingPortalRole } from "@/lib/pp/auth";

type LeavePayload = {
  from_date?: string;
  to_date?: string;
  reason?: string | null;
  requester_name?: string | null;
  requester_employee_id?: string | null;
};

export default async function PpTeamLeavesPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const { data: me } = await supabase.from("employees").select("id, full_name").eq("email", (session.user.email ?? "").trim()).maybeSingle();
  if (!me) redirect("/login");

  const { data: portalRoles } = await supabase.from("employee_roles").select("role").eq("employee_id", me.id);
  if (!hasReportingPortalRole(portalRoles ?? [])) redirect("/dashboard");

  const { data: approvals } = await supabase
    .from("approvals")
    .select("id, status, created_at, payload_json, requester_id, pm_comment, admin_comment")
    .eq("approval_type", "leave_request")
    .neq("requester_id", session.user.id)
    .order("created_at", { ascending: false });

  const list = approvals ?? [];

  return (
    <div className="space-y-6">
      <nav className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <Link href="/dashboard/pp" className="hover:text-zinc-900">
          Reporting
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Team leave</span>
      </nav>

      <header className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Team leave requests</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Leave applications from DT and Driver/Rigger on teams you can see. Reporting staff normally see every team;
          legacy PP may still match by home region and project or when set as Post Processor on the team. Admin and super user
          still approve the workflow.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/leave" className="font-medium text-teal-800 underline hover:text-teal-950">
            Your own leave requests →
          </Link>
        </p>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          No leave requests from your team members yet, or none you can see. Confirm your reporting access with an administrator if this looks wrong.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const payload = (a.payload_json as LeavePayload) ?? {};
            const name = payload.requester_name?.trim() || "Team member";
            const isApproved = a.status === "Completed" || a.status === "Admin_Approved";
            const isRejected = a.status === "Admin_Rejected" || a.status === "PM_Rejected";
            const inPerforma =
              a.status === "Awaiting_Signed_Performa" || a.status === "Performa_Submitted";
            return (
              <li
                key={a.id}
                className={`rounded-xl border p-4 ${
                  isApproved
                    ? "border-emerald-200 bg-emerald-50/50"
                    : isRejected
                      ? "border-red-200 bg-red-50/50"
                      : inPerforma
                        ? "border-violet-200 bg-violet-50/30"
                        : "border-zinc-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-900">{name}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      isApproved ? "bg-emerald-100 text-emerald-800" : isRejected ? "bg-red-100 text-red-800" : inPerforma ? "bg-violet-100 text-violet-900" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {a.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">
                  {payload.from_date ?? "—"} to {payload.to_date ?? "—"}
                </p>
                {payload.reason ? <p className="mt-1 text-sm text-zinc-600">Reason: {payload.reason}</p> : null}
                {(a.pm_comment || a.admin_comment) && (
                  <p className="mt-2 text-xs text-zinc-500">
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
    </div>
  );
}
