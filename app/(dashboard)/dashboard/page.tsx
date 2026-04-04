import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AssignedAssetsList } from "@/components/assets/AssignedAssetsList";
import { ReturnVehicleButton } from "@/components/returns/ReturnVehicleButton";
import { ReturnSimButton } from "@/components/returns/ReturnSimButton";

export default async function DashboardPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return null;

  const email = (session.user.email ?? "").trim().toLowerCase();
  const supabase = await getDataClient();
  const { data: employee } = await supabase.from("employees").select("id, full_name, email, region_id, project_id, project_name_other, status").eq("email", email).maybeSingle();
  const { data: userProfile } = await supabase.from("users_profile").select("id, status").eq("email", email).maybeSingle();

  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;
  if (isAdminView) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Admin view</h1>
        <p className="text-zinc-600">You are viewing the Employee Portal as an admin. Full tracking and history are in the Admin Portal.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/admin-overview" className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">All employees</Link>
          <a href={process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL || "/"} className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Open Admin Portal</a>
        </div>
      </div>
    );
  }

  if (!employee) return null;

  const { data: myRoles } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employee.id);
  const isQc = (myRoles ?? []).some((r) => r.role === "QC");
  const isPm = (myRoles ?? []).some((r) => r.role === "Project Manager");
  const isPp = (myRoles ?? []).some((r) => r.role === "PP");
  const isProjectCoordinator = (myRoles ?? []).some((r) => r.role === "Project Coordinator");
  const isDriverOrSelfDt = (myRoles ?? []).some((r) => r.role === "Driver/Rigger" || r.role === "Self DT");

  const [regionRes, assetsRes, simsRes, assignmentsRes, tasksRes, approvalsRes, regionEmployeesRes, pendingReceiptsRes] = await Promise.all([
    employee.region_id
      ? supabase.from("regions").select("id, name, code").eq("id", employee.region_id).single()
      : { data: null },
    supabase.from("assets").select("id, name, category, model, serial, imei_1, imei_2, status").eq("assigned_to_employee_id", employee.id).order("name"),
    supabase
      .from("sim_cards")
      .select("id, sim_number, phone_number, operator, service_type, status")
      .eq("assigned_to_employee_id", employee.id)
      .order("assigned_at", { ascending: false }),
    supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", employee.id),
    supabase
      .from("tasks")
      .select("id, title, status, due_date")
      .eq("assigned_to_user_id", session.user.id)
      .order("due_date", { ascending: true }),
    supabase
      .from("approvals")
      .select("id, approval_type, status, created_at, payload_json")
      .eq("requester_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    isQc && employee.region_id
      ? supabase
          .from("employees")
          .select("id, full_name, email")
          .eq("region_id", employee.region_id)
      : { data: [] },
    supabase
      .from("resource_receipt_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employee.id)
      .eq("status", "pending"),
  ]);

  const region = regionRes.data;
  const assets = assetsRes.data ?? [];
  const sims = simsRes.data ?? [];
  const vehicleIds = (assignmentsRes.data ?? []).map((a) => a.vehicle_id);
  const tasks = tasksRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const regionEmployees = (regionEmployeesRes?.data ?? []).filter(
    (e) => e.id !== employee.id
  ) as { id: string; full_name: string; email?: string | null }[];

  const { data: vehicles } = vehicleIds.length
    ? await supabase.from("vehicles").select("id, plate_number, make, model").in("id", vehicleIds)
    : { data: [] };
  const leaveRequests = approvals.filter((a) => a.approval_type === "leave_request");
  const openTasks = tasks.filter((t) => t.status !== "Completed" && t.status !== "Closed");
  const pendingReceiptCount = pendingReceiptsRes.count ?? 0;

  return (
    <div className="space-y-6">
      {pendingReceiptCount > 0 ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Receipt confirmation required</p>
              <p className="mt-1 text-sm text-amber-950/90">
                {pendingReceiptCount === 1
                  ? "One assigned item needs you to confirm you received it."
                  : `${pendingReceiptCount} assigned items need you to confirm receipt.`}{" "}
                Assignees must acknowledge receipt of assets, SIMs, and vehicles.
              </p>
            </div>
            <Link
              href="/dashboard/receipts"
              className="shrink-0 rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900"
            >
              Confirm receipt →
            </Link>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50 via-violet-50 to-slate-50 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-700">
              Your region, assignments, tasks, and leave activity in one place. When you receive assigned assets, SIMs, or vehicles, confirm receipt under Confirm receipt. Return tools, SIMs, and vehicles from this dashboard before leaving a team—QC and PM are notified.
            </p>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
            {isPm
              ? "Project Manager"
              : isQc
                ? "QC"
                : isPp
                  ? "Post Processor"
                  : isProjectCoordinator
                    ? "Project Coordinator"
                    : "Team Member"}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-white/90 p-4">
            <p className="text-xs font-medium text-emerald-700">Assigned assets</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{assets.length}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-white/90 p-4">
            <p className="text-xs font-medium text-sky-700">Assigned vehicles</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{vehicles?.length ?? 0}</p>
          </div>
          <div className="rounded-xl border border-fuchsia-200 bg-white/90 p-4">
            <p className="text-xs font-medium text-fuchsia-700">Assigned SIMs</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{sims.length}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white/90 p-4">
            <p className="text-xs font-medium text-amber-700">Open tasks</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{openTasks.length}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="fts-surface p-5 xl:col-span-2">
          <h2 className="text-lg font-semibold text-zinc-900">My region</h2>
          <p className="mt-1 text-zinc-600">{region?.name ?? "—"} {region?.code ? `(${region.code})` : ""}</p>
        </section>
        <section className="fts-surface p-5">
          <h2 className="text-lg font-semibold text-zinc-900">Quick summary</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-700">Pending leave requests: <strong>{leaveRequests.filter((r) => r.status === "Submitted" || r.status === "PM_Approved").length}</strong></p>
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-700">Completed tasks: <strong>{tasks.filter((t) => t.status === "Completed" || t.status === "Closed").length}</strong></p>
          </div>
        </section>
      </div>

      {/* PM: assets management links */}
      {isPm && (
        <section className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Project Manager — Assets</h2>
          <p className="mt-1 text-sm text-zinc-600">Assign existing assets to employees in your region, or request new assets from Admin.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/region-employees-assets" className="rounded border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100">Who has assets</Link>
            <Link href="/dashboard/assets/assign" className="rounded border border-white bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Assign to employee</Link>
            <Link href="/dashboard/sims/assign" className="rounded border border-white bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Assign SIMs</Link>
            <Link href="/dashboard/vehicles/assign" className="rounded border border-white bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Assign vehicles</Link>
            <Link href="/dashboard/assets/request" className="rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100">Request asset from admin</Link>
            <Link href="/dashboard/requests-from-qc" className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Requests from QC</Link>
            <Link href="/dashboard/asset-returns" className="rounded border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100">Asset returns</Link>
          </div>
        </section>
      )}

      {/* QC: same-region employees, assets with QC, assign asset to employee */}
      {isQc && (
        <section className="fts-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">QC — Your region</h2>
          <p className="mt-1 text-sm text-zinc-600">Employees in your region and assets currently assigned to you.</p>
          <Link
            href="/dashboard/region-employees-assets"
            className="mt-3 inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100"
          >
            See who has tools assigned →
          </Link>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-zinc-700">Employees in your region</h3>
              {regionEmployees.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-500">No other employees in your region.</p>
              ) : (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-zinc-700">
                  {regionEmployees.map((e) => (
                    <li key={e.id}>{e.full_name}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-700">Assets with you</h3>
              <p className="mt-1 text-xs text-zinc-500">
                To hand a tool back to the pool, use <strong className="font-medium text-zinc-700">Return</strong> on that row—
                including when status is With_QC or assigned.
              </p>
              {assets.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-500">No assets currently assigned to you.</p>
              ) : (
                <AssignedAssetsList assets={assets} />
              )}
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-100 pt-6">
            <p className="text-sm text-zinc-600">When an asset is not OK for use, request the PM for replacement.</p>
            <Link href="/dashboard/request-to-pm" className="mt-2 inline-block rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">Request to PM</Link>
          </div>
        </section>
      )}

      {isPp && (
        <section className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Post Processor — team lead</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Post Processor role only: see teams that match your region and project in Admin (or where you are set Post Processor on the team), plus member
            tools, SIMs, vehicles, and their leave requests.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/pp" className="rounded bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900">
              Open PP dashboard
            </Link>
            <Link
              href="/dashboard/pp/leaves"
              className="rounded border border-teal-300 bg-white px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50"
            >
              Team leave requests
            </Link>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {!isQc && (
          <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-zinc-900">Assets assigned to me</h2>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
              <AssignedAssetsList assets={assets} />
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">My vehicle(s)</h2>
          {!vehicles?.length ? (
            <p className="mt-3 rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-sm text-zinc-500">No vehicle assigned.</p>
          ) : (
            <ul className="mt-3 space-y-2 rounded-xl border border-sky-100 bg-sky-50/40 p-4 text-sm text-zinc-700">
              {(vehicles ?? []).map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{v.plate_number}</span>
                  {(v.make || v.model) && <span className="text-zinc-500"> — {[v.make, v.model].filter(Boolean).join(" ")}</span>}
                  {isDriverOrSelfDt ? (
                    <ReturnVehicleButton plateLabel={[v.plate_number, v.make, v.model].filter(Boolean).join(" · ")} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-fuchsia-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">My SIM(s)</h2>
          {!sims.length ? (
            <p className="mt-3 rounded-xl border border-fuchsia-100 bg-fuchsia-50/40 p-4 text-sm text-zinc-500">No SIM assigned.</p>
          ) : (
            <ul className="mt-3 space-y-2 rounded-xl border border-fuchsia-100 bg-fuchsia-50/30 p-4 text-sm text-zinc-700">
              {sims.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-white px-2 py-0.5 font-mono text-xs text-zinc-800">{s.sim_number}</span>
                  {s.phone_number ? <span className="text-zinc-600">· {s.phone_number}</span> : null}
                  <span className="text-zinc-600">· {s.operator}</span>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{s.service_type}</span>
                  {s.status === "Assigned" ? (
                    <ReturnSimButton simId={s.id} label={`${s.sim_number} · ${s.operator}`} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Tasks assigned to me</h2>
          <Link href="/tasks" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">View all →</Link>
        </div>
        {tasks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4 text-sm text-zinc-500">No tasks assigned.</p>
        ) : (
          <ul className="mt-3 space-y-2 rounded-xl border border-amber-100 bg-amber-50/30 p-3">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="block rounded-lg border border-zinc-200 bg-white p-3 hover:bg-zinc-50">
                  <span className="font-medium text-zinc-900">{t.title}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${t.status === "Completed" || t.status === "Closed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{t.status}</span>
                  {t.due_date && <span className="ml-2 text-sm text-zinc-500">Due: {t.due_date}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        </section>
      </div>

      <section className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">My leave requests</h2>
          <Link href="/leave" className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">Apply for leave</Link>
        </div>
        {approvals.filter((a) => a.approval_type === "leave_request").length === 0 ? (
          <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50/40 p-4 text-sm text-zinc-500">No leave requests yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 rounded-xl border border-rose-100 bg-rose-50/30 p-3">
            {approvals
              .filter((a) => a.approval_type === "leave_request")
              .slice(0, 5)
              .map((a) => {
                const payload = (a.payload_json as { from_date?: string; to_date?: string; reason?: string }) ?? {};
                return (
                  <li key={a.id} className="flex items-center justify-between rounded border border-zinc-100 p-3">
                    <div>
                      <span className="text-sm text-zinc-600">{payload.from_date ?? "—"} to {payload.to_date ?? "—"}</span>
                      {payload.reason && <span className="ml-2 text-sm text-zinc-500">— {payload.reason}</span>}
                    </div>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      a.status === "Admin_Approved" || a.status === "Completed" ? "bg-emerald-100 text-emerald-800" :
                      a.status === "Admin_Rejected" || a.status === "PM_Rejected" ? "bg-red-100 text-red-800" :
                      "bg-amber-100 text-amber-800"
                    }`}>{a.status}</span>
                  </li>
                );
              })}
          </ul>
        )}
        <p className="mt-2">
          <Link href="/leave" className="text-sm text-zinc-600 hover:text-zinc-900">View all requests →</Link>
        </p>
      </section>
    </div>
  );
}
