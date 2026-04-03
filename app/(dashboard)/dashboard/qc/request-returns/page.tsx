import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import { RequestReturnClient } from "./RequestReturnClient";

export default async function QcRequestReturnsPage() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) redirect("/login");

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: me } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!me?.region_id) redirect("/dashboard");

  const { data: qcRole } = await supabase.from("employee_roles").select("role").eq("employee_id", me.id).eq("role", "QC").maybeSingle();
  if (!qcRole) redirect("/dashboard");

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("region_id", me.region_id)
    .eq("status", "ACTIVE")
    .neq("id", me.id)
    .order("full_name");

  const empIds = (regionEmps ?? []).map((e) => e.id);
  const { data: roles } = empIds.length
    ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", empIds)
    : { data: [] };
  const qcIds = new Set((roles ?? []).filter((r) => r.role === "QC").map((r) => r.employee_id));
  const selectable = (regionEmps ?? []).filter((e) => !qcIds.has(e.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Request return from employee</h1>
        <p className="mt-1 text-sm text-zinc-600">QC · same region only</p>
      </div>
      <RequestReturnClient regionEmployees={selectable} />
    </div>
  );
}
