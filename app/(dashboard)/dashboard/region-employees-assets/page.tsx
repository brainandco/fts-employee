import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";

type AssetRow = {
  id: string;
  name: string | null;
  serial: string | null;
  category: string | null;
  status: string | null;
  assigned_to_employee_id: string | null;
};

export default async function RegionEmployeesWithAssetsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase
    .from("employees")
    .select("id, full_name, region_id, status")
    .eq("email", email)
    .maybeSingle();

  if (!me || me.status !== "ACTIVE") redirect("/dashboard");

  const { data: myRoles } = await supabase.from("employee_roles").select("role").eq("employee_id", me.id);
  const roleSet = new Set((myRoles ?? []).map((r) => r.role));
  const isPm = roleSet.has("Project Manager");
  const isQc = roleSet.has("QC");
  if (!isPm && !isQc) redirect("/dashboard");
  // QC roster is region-scoped; PM without region_id still sees unscoped employees (same as vehicle assign).
  if (isQc && !me.region_id) redirect("/dashboard");

  const regionEmpsQuery = me.region_id
    ? supabase
        .from("employees")
        .select("id, full_name, email")
        .eq("region_id", me.region_id)
        .eq("status", "ACTIVE")
        .order("full_name")
    : supabase.from("employees").select("id, full_name, email").eq("status", "ACTIVE").is("region_id", null).order("full_name");
  const { data: regionEmps } = await regionEmpsQuery;

  const empIds = (regionEmps ?? []).map((e) => e.id);
  const { data: allRoles } = empIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", empIds)
    : { data: [] };

  const rolesByEmp = new Map<string, string[]>();
  for (const r of allRoles ?? []) {
    const arr = rolesByEmp.get(r.employee_id) ?? [];
    arr.push(r.role);
    rolesByEmp.set(r.employee_id, arr);
  }

  const { data: assignedAssets } = empIds.length
    ? await supabase
        .from("assets")
        .select("id, name, serial, category, status, assigned_to_employee_id")
        .in("assigned_to_employee_id", empIds)
        .in("status", ["Assigned", "Under_Maintenance", "Damaged", "With_QC"])
        .order("name")
    : { data: [] };

  const assetsByEmp = new Map<string, AssetRow[]>();
  for (const a of assignedAssets ?? []) {
    const eid = a.assigned_to_employee_id;
    if (!eid) continue;
    const list = assetsByEmp.get(eid) ?? [];
    list.push(a as AssetRow);
    assetsByEmp.set(eid, list);
  }

  const withAssets = (regionEmps ?? []).filter((e) => (assetsByEmp.get(e.id)?.length ?? 0) > 0);
  const withoutCount = (regionEmps ?? []).length - withAssets.length;

  const { data: regionRow } = me.region_id
    ? await supabase.from("regions").select("name, code").eq("id", me.region_id).single()
    : { data: null as { name: string; code: string | null } | null };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Employees with assigned tools</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {me.region_id ? (
              <>
                Same region as you ({regionRow?.name ?? "—"}
                {regionRow?.code ? ` · ${regionRow.code}` : ""}). Active employees who currently have at least one tool
                assigned (including under maintenance or damaged while still on hand).
              </>
            ) : (
              <>
                Employees with <strong>no region</strong> on record (your profile has no region). Active employees who
                currently have at least one tool assigned (including under maintenance or damaged while still on hand).
              </>
            )}
          </p>
        </div>
      </div>

      {withAssets.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-8 text-center">
          <p className="text-sm font-medium text-zinc-800">No assigned tools in this region right now</p>
          <p className="mt-1 text-sm text-zinc-600">
            When PM assigns assets to employees in your region, they will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-5 py-4">
            <p className="text-sm font-medium text-indigo-900">
              {withAssets.length} employee{withAssets.length === 1 ? "" : "s"} with tools
              {withoutCount > 0 ? (
                <span className="ml-2 font-normal text-indigo-800/80">
                  · {withoutCount} other active employee{withoutCount === 1 ? "" : "s"} in region have none
                </span>
              ) : null}
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {withAssets.map((emp) => {
              const assets = assetsByEmp.get(emp.id) ?? [];
              const roles = rolesByEmp.get(emp.id) ?? [];
              return (
                <div key={emp.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium text-zinc-900">{emp.full_name}</p>
                      {emp.email ? <p className="text-xs text-zinc-500">{emp.email}</p> : null}
                      {roles.length > 0 ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          Roles:{" "}
                          <span className="font-medium text-zinc-800">{roles.join(", ")}</span>
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                      {assets.length} tool{assets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5 rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 text-sm text-zinc-700">
                    {assets.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-medium text-zinc-900">{a.name ?? "—"}</span>
                        {a.serial ? <span className="font-mono text-xs text-zinc-600">· {a.serial}</span> : null}
                        {a.category ? <span className="text-zinc-500">· {a.category}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
