import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Employees in the same region as the current user (for leave guarantor picker). */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const { data: me } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", (session.user.email ?? "").trim().toLowerCase())
    .maybeSingle();

  if (!me?.region_id) {
    return NextResponse.json({ employees: [] });
  }

  const { data: rows } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department")
    .eq("region_id", me.region_id)
    .eq("status", "ACTIVE")
    .neq("id", me.id)
    .order("full_name");

  const empIds = (rows ?? []).map((e) => e.id as string);
  const { data: roleRows } =
    empIds.length > 0
      ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", empIds)
      : { data: [] as { employee_id: string; role: string }[] };
  const rolesByEmp = new Map<string, Set<string>>();
  for (const r of roleRows ?? []) {
    const id = r.employee_id as string;
    const role = String(r.role ?? "").trim();
    if (!role) continue;
    if (!rolesByEmp.has(id)) rolesByEmp.set(id, new Set());
    rolesByEmp.get(id)!.add(role);
  }
  const rolesByEmpList = new Map<string, string[]>();
  for (const [id, set] of rolesByEmp) {
    rolesByEmpList.set(id, [...set].sort((a, b) => a.localeCompare(b)));
  }

  return NextResponse.json({
    employees: (rows ?? []).map((e) => {
      const id = e.id as string;
      const roles = rolesByEmpList.get(id) ?? [];
      const roleSubtitle = roles.length ? roles.join(", ") : "";
      const fallback = [e.job_title, e.department].filter(Boolean).join(" · ") || "";
      return {
        id,
        full_name: (e.full_name ?? "").trim() || id,
        subtitle: roleSubtitle || fallback,
      };
    }),
  });
}
