import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import {
  loadEmployeeIdsInRegions,
  loadReceiptConfirmationsForScope,
} from "@/lib/receipt-confirmations/load-receipt-confirmations";
import { ReceiptConfirmationsTable } from "@/components/receipts/ReceiptConfirmationsTable";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";

export default async function PmReceiptConfirmationsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const access = await resolveEmployeePortalAccess(session);
  if (access.kind === "denied") redirect("/login");

  const supabase = await getDataClient();
  const isAdminView = access.kind === "admin_view";

  let scopeLabel = "your regions";
  let rows;

  if (isAdminView) {
    scopeLabel = "all regions";
    rows = await loadReceiptConfirmationsForScope(supabase, null);
  } else {
    const email = access.email.trim().toLowerCase();
    const { data: employee } = await supabase
      .from("employees")
      .select("id, region_id, project_id, status")
      .eq("email", email)
      .maybeSingle();

    if (!employee || employee.status !== "ACTIVE") redirect("/dashboard");

    const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
    const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
    if (!isPm) redirect("/dashboard");

    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      session.user.id
    );

    const scopeEmployeeIds = await loadEmployeeIdsInRegions(supabase, allowedRegionIds);
    rows = await loadReceiptConfirmationsForScope(supabase, scopeEmployeeIds);

    if (allowedRegionIds.length === 1) {
      const { data: region } = await supabase.from("regions").select("name").eq("id", allowedRegionIds[0]!).maybeSingle();
      scopeLabel = region?.name ?? "your region";
    }
  }

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">
          Dashboard
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Receipt confirmations</span>
      </nav>

      <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Receipt confirmations</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-700">
          Employees confirm in <span className="font-medium text-zinc-900">Confirm receipt</span> when they physically
          receive assigned tools, SIMs, or vehicles. This list shows who has confirmed and who is still pending in{" "}
          <span className="font-medium text-zinc-900">{scopeLabel}</span>. For assets, condition photos appear once the
          employee confirms.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-900">
            Pending: {pendingCount}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-900">
            Confirmed: {confirmedCount}
          </span>
        </div>
      </div>

      <ReceiptConfirmationsTable rows={rows} />
    </div>
  );
}
