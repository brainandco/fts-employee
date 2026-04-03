import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RequestToPmForm } from "./RequestToPmForm";

const REASONS = ["Damaged", "Not working", "Deprecated", "Does not meet work conditions", "Other"] as const;

export default async function RequestToPmPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const email = (session.user.email ?? "").trim();
  const supabase = await getDataClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name, region_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) redirect("/login");

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const isQc = (roles ?? []).some((r) => r.role === "QC");
  if (!isQc) redirect("/dashboard");

  const { data: qcIds } = await supabase.from("employee_roles").select("employee_id").eq("role", "QC");
  const qcSet = new Set((qcIds ?? []).map((r) => r.employee_id));
  const { data: regionEmployees } = employee.region_id
    ? await supabase.from("employees").select("id, full_name").eq("region_id", employee.region_id).eq("status", "ACTIVE")
    : { data: [] };
  const employees = (regionEmployees ?? []).filter((e) => e.id !== employee.id && !qcSet.has(e.id));

  const regionEmployeeIds = (regionEmployees ?? []).map((e) => e.id);
  const assigneeIds = [employee.id, ...regionEmployeeIds];
  const { data: assetsInRegion } = assigneeIds.length > 0
    ? await supabase
        .from("assets")
        .select("id, name, serial, category, assigned_to_employee_id, status")
        .in("assigned_to_employee_id", assigneeIds)
        .in("status", ["Assigned"])
    : { data: [] };
  const assets = (assetsInRegion ?? []).filter((a) => a.assigned_to_employee_id);

  const { data: requests } = await supabase
    .from("asset_replacement_requests")
    .select(`
      id, asset_id, for_employee_id, reason, notes, status, created_at,
      assets:asset_id ( name, serial ),
      for_employee:for_employee_id ( full_name ),
      replacement_asset:replacement_asset_id ( name, serial )
    `)
    .eq("requested_by_employee_id", employee.id)
    .order("created_at", { ascending: false });

  const empMap = new Map(employees.map((e) => [e.id, e.full_name]));

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Request to PM</span>
      </nav>
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="fts-page-title">Request to Project Manager</h1>
        <p className="fts-page-desc">
          When an asset is not fit for use, submit a structured request. PM will review and assign replacement if available.
        </p>
      </div>

      <div className="fts-panel p-6">
        <h2 className="mb-4 text-lg font-medium text-zinc-900">New request</h2>
        <RequestToPmForm
          assets={assets.map((a) => ({
            id: a.id,
            name: a.name,
            serial: a.serial,
            category: a.category,
            assigned_to_employee_id: a.assigned_to_employee_id!,
            assigned_name: empMap.get(a.assigned_to_employee_id!) ?? "—",
          }))}
          employees={employees}
          reasons={REASONS}
        />
      </div>

      <div className="fts-panel p-6">
        <h2 className="mb-4 text-lg font-medium text-zinc-900">My requests</h2>
        {!requests?.length ? (
          <p className="text-sm text-zinc-500">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {(requests as unknown[]).map((r) => {
              const req = r as Record<string, unknown>;
              const asset = req.assets as { name?: string; serial?: string } | null;
              const forEmp = req.for_employee as { full_name?: string } | null;
              const repl = req.replacement_asset as { name?: string; serial?: string } | null;
              return (
                <li key={req.id as string} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 last:border-0">
                  <div>
                    <span className="font-medium text-zinc-900">{asset?.name ?? "—"}</span>
                    {asset?.serial && <span className="text-zinc-500"> ({asset.serial})</span>}
                    <span className="text-zinc-500"> → for {forEmp?.full_name ?? "—"}</span>
                    <span className="ml-2 text-sm text-zinc-500">({req.reason as string})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      req.status === "Pending" ? "bg-amber-100 text-amber-800" :
                      req.status === "Fulfilled" ? "bg-emerald-100 text-emerald-800" :
                      "bg-zinc-100 text-zinc-600"
                    }`}>{req.status as string}</span>
                    {repl && <span className="text-xs text-zinc-500">Replacement: {repl.name}{repl.serial ? ` (${repl.serial})` : ""}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
