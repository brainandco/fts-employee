import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AssignedAssetsList } from "@/components/assets/AssignedAssetsList";

export default async function PmAssetsPage() {
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
  const isPm = (roles ?? []).some((r) => r.role === "Project Manager");
  const isQc = (roles ?? []).some((r) => r.role === "QC");
  if (!isPm && !isQc) redirect("/dashboard");

  if (isQc && !isPm) {
    const { data: qcAssets } = await supabase
      .from("assets")
      .select("id, name, category, model, serial, imei_1, imei_2, status")
      .eq("assigned_to_employee_id", employee.id)
      .order("name");

    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-5 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">QC assets</h1>
          <p className="mt-1 text-sm text-zinc-600">View assets assigned to you and request PM action when needed.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/request-to-pm" className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Request to PM
            </Link>
            <Link href="/dashboard" className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Back to dashboard
            </Link>
          </div>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Assets assigned to me</h2>
          <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
            <AssignedAssetsList assets={qcAssets ?? []} />
          </div>
        </section>
      </div>
    );
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, category, model, serial, imei_1, imei_2, status, assigned_to_employee_id, assigned_region_id")
    .or(employee.region_id ? `assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null` : "assigned_region_id.is.null")
    .order("name");

  const employeeIds = [...new Set((assets ?? []).map((a) => a.assigned_to_employee_id).filter(Boolean) as string[])];
  const { data: employees } = employeeIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", employeeIds)
    : { data: [] };
  const employeeMap = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  const available = (assets ?? []).filter((a) => a.status === "Available" && !a.assigned_to_employee_id);
  const assigned = (assets ?? []).filter((a) => a.status !== "Available" || a.assigned_to_employee_id);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-slate-50 p-5 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Assets</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage assets for your region. Assign existing assets to employees or request new assets from Admin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/assets/assign" className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Assign to employee</Link>
          <Link href="/dashboard/assets/request" className="rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-100">Request asset</Link>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Available (unassigned)</h2>
        {available.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No available assets. Request new assets from Admin or assign from existing stock.</p>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Serial</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 1</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 2</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Type</th>
                </tr>
              </thead>
              <tbody>
                {available.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">{a.serial ?? "—"}</td>
                    <td className="px-4 py-3">{a.model ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.imei_1 ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.imei_2 ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{a.name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{a.category ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="mb-3 text-lg font-medium text-zinc-900">Assigned</h2>
        {assigned.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No assigned assets.</p>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Serial</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 1</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">IMEI 2</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-700">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3">{a.serial ?? "—"}</td>
                    <td className="px-4 py-3">{a.model ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.imei_1 ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.imei_2 ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{a.name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{a.category ?? "—"}</td>
                    <td className="px-4 py-3">{a.status}</td>
                    <td className="px-4 py-3">{a.assigned_to_employee_id ? employeeMap.get(a.assigned_to_employee_id) ?? "—" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
