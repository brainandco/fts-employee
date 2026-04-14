import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import {
  RegionEmployeesWithAssetsClient,
  type EmployeeWithAssets,
  type AssetLine,
} from "./RegionEmployeesWithAssetsClient";

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
        .select("id, name, model, serial, category, status, assigned_to_employee_id")
        .in("assigned_to_employee_id", empIds)
        .in("status", ["Assigned", "Under_Maintenance", "Damaged", "With_QC"])
        .order("name")
    : { data: [] };

  const assetsByEmp = new Map<string, AssetLine[]>();
  for (const a of assignedAssets ?? []) {
    const eid = a.assigned_to_employee_id;
    if (!eid) continue;
    const list = assetsByEmp.get(eid) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      model: a.model,
      serial: a.serial,
      category: a.category,
      status: a.status,
    });
    assetsByEmp.set(eid, list);
  }

  const withAssetsList: EmployeeWithAssets[] = (regionEmps ?? [])
    .filter((e) => (assetsByEmp.get(e.id)?.length ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      full_name: e.full_name ?? "—",
      email: e.email,
      roles: rolesByEmp.get(e.id) ?? [],
      assets: assetsByEmp.get(e.id) ?? [],
    }));

  const withoutCount = (regionEmps ?? []).length - withAssetsList.length;

  const { data: regionRow } = me.region_id
    ? await supabase.from("regions").select("name, code").eq("id", me.region_id).single()
    : { data: null as { name: string; code: string | null } | null };

  const regionLabel = me.region_id
    ? `${regionRow?.name ?? "—"}${regionRow?.code ? ` · ${regionRow.code}` : ""}`
    : "No region (unscoped roster)";

  return (
    <div className="space-y-8 pb-10">
      <div>
        <Link href="/dashboard" className="text-sm font-medium text-zinc-500 transition hover:text-indigo-600">
          ← Dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600/90">Employee portal · PM / QC</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">Who has assets</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Active colleagues in <span className="font-semibold text-zinc-800">{regionLabel}</span> who currently hold
              at least one tool (including under maintenance, damaged, or with QC while still on assignment). Search by
              person, email, model, serial, or type.
            </p>
          </div>
        </div>
      </div>

      <RegionEmployeesWithAssetsClient
        employees={withAssetsList}
        regionLabel={regionLabel}
        withoutCount={withoutCount}
      />
    </div>
  );
}
