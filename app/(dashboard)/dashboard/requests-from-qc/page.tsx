import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PmRequestsList, type RequestItem, type Asset } from "./PmRequestsList";

export default async function RequestsFromQcPage() {
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
  if (!isPm) redirect("/dashboard");

  const { data: all } = await supabase
    .from("asset_replacement_requests")
    .select(`
      id, asset_id, for_employee_id, requested_by_employee_id, reason, notes, status, created_at,
      resolved_at, replacement_asset_id,
      assets:asset_id ( id, name, serial, category ),
      for_employee:for_employee_id ( id, full_name ),
      requested_by:requested_by_employee_id ( id, full_name ),
      replacement_asset:replacement_asset_id ( id, name, serial )
    `)
    .order("created_at", { ascending: false });

  const forIds = [...new Set((all ?? []).map((r: { for_employee_id: string }) => r.for_employee_id))];
  const { data: forEmps } = forIds.length
    ? await supabase.from("employees").select("id, region_id").in("id", forIds)
    : { data: [] };
  const regionByEmp = new Map((forEmps ?? []).map((e) => [e.id, e.region_id]));
  const filtered = (all ?? []).filter((r: { for_employee_id: string }) => {
    if (!employee.region_id) return true;
    return regionByEmp.get(r.for_employee_id) === employee.region_id;
  });

  const toSingle = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;
  const requests: RequestItem[] = filtered.map((r: Record<string, unknown>) => {
    const asset = toSingle(r.assets as Asset | Asset[] | null);
    const forEmp = toSingle(r.for_employee as { id: string; full_name: string } | { id: string; full_name: string }[] | null);
    const reqBy = toSingle(r.requested_by as { id: string; full_name: string } | { id: string; full_name: string }[] | null);
    const repl = toSingle(r.replacement_asset as Asset | Asset[] | null);
    return {
      id: r.id as string,
      asset_id: r.asset_id as string,
      for_employee_id: r.for_employee_id as string,
      reason: r.reason as string,
      notes: r.notes as string | null,
      status: r.status as string,
      created_at: r.created_at as string,
      assets: asset as Asset | null,
      for_employee: forEmp as { id: string; full_name: string } | null,
      requested_by: reqBy as { id: string; full_name: string } | null,
      replacement_asset: repl as Asset | null,
    };
  });

  const { data: availableAssets } = await supabase
    .from("assets")
    .select("id, name, serial, category")
    .eq("status", "Available")
    .or(employee.region_id ? `assigned_region_id.eq.${employee.region_id},assigned_region_id.is.null` : "assigned_region_id.is.null")
    .order("name");

  return (
    <div>
      <nav className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Requests from QC</span>
      </nav>
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Requests from QC</h1>
      <p className="mb-6 text-sm text-zinc-600">
        QC confirms whether assets are OK for use. When an asset is not OK, they request you here. Fulfill by assigning a replacement asset from your compound to the employee.
      </p>
      <PmRequestsList requests={requests} availableAssets={availableAssets ?? []} />
    </div>
  );
}
