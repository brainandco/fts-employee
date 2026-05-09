import { createServerSupabaseClient, getDataClient } from "@/lib/supabase/server";
import {
  fetchActiveProjectManagerEmployees,
  fetchAdministratorEmployeeGuarantors,
  resolveLeaveGuarantorPickerMode,
  type LeaveGuarantorPickerMode,
} from "@/lib/leave/guarantor-rules";
import { NextResponse } from "next/server";

function rowsWithRoles(
  rows: { id: string; full_name: string | null; job_title: string | null; department: string | null }[],
  rolesByEmpList: Map<string, string[]>
) {
  return rows.map((e) => {
    const id = e.id as string;
    const roles = rolesByEmpList.get(id) ?? [];
    const roleSubtitle = roles.length ? roles.join(", ") : "";
    const fallback = [e.job_title, e.department].filter(Boolean).join(" · ") || "";
    return {
      id,
      full_name: (e.full_name ?? "").trim() || id,
      subtitle: roleSubtitle || fallback,
    };
  });
}

async function loadRolesForEmployeeIds(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  empIds: string[]
): Promise<Map<string, string[]>> {
  const rolesByEmp = new Map<string, Set<string>>();
  const { data: roleRows } =
    empIds.length > 0
      ? await supabase.from("employee_roles").select("employee_id, role").in("employee_id", empIds)
      : { data: [] as { employee_id: string; role: string }[] };
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
  return rolesByEmpList;
}

/** Employees eligible as leave guarantor for the current user (region-based or PM/admin rules). */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();

  const { data: me } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();

  if (!me?.id) {
    return NextResponse.json({ mode: "same_region" as LeaveGuarantorPickerMode, employees: [] });
  }

  const mode = await resolveLeaveGuarantorPickerMode(supabase, session.user.id, me.id);

  if (mode === "pm_picks_admin") {
    const rows = await fetchAdministratorEmployeeGuarantors(supabase, me.id);
    const ids = rows.map((r) => r.id);
    const rolesByEmpList = await loadRolesForEmployeeIds(supabase, ids);
    return NextResponse.json({ mode, employees: rowsWithRoles(rows, rolesByEmpList) });
  }

  if (mode === "admin_picks_pm") {
    const rows = await fetchActiveProjectManagerEmployees(supabase, me.id);
    const ids = rows.map((r) => r.id);
    const rolesByEmpList = await loadRolesForEmployeeIds(supabase, ids);
    return NextResponse.json({ mode, employees: rowsWithRoles(rows, rolesByEmpList) });
  }

  if (!me.region_id) {
    return NextResponse.json({ mode, employees: [] });
  }

  const { data: rows } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department")
    .eq("region_id", me.region_id)
    .eq("status", "ACTIVE")
    .neq("id", me.id)
    .order("full_name");

  const empIds = (rows ?? []).map((e) => e.id as string);
  const rolesByEmpList = await loadRolesForEmployeeIds(supabase, empIds);

  return NextResponse.json({
    mode,
    employees: rowsWithRoles(
      (rows ?? []) as { id: string; full_name: string | null; job_title: string | null; department: string | null }[],
      rolesByEmpList
    ),
  });
}
