import type { SupabaseClient } from "@supabase/supabase-js";

export type EmployeeWorkInfo = {
  employeeCode: string | null;
  roles: string[];
  regionName: string | null;
  regionCode: string | null;
  projectName: string | null;
  jobTitle: string | null;
  department: string | null;
  country: string | null;
  status: string | null;
  onboardingDate: string | null;
};

function displayRole(role: string, roleCustom: string | null): string {
  if (role === "Other" && roleCustom?.trim()) return roleCustom.trim();
  return role.trim();
}

/** Load role, region, project, and HR fields for mobile profile / dashboard. */
export async function loadEmployeeWorkInfo(
  supabase: SupabaseClient,
  employeeId: string
): Promise<EmployeeWorkInfo | null> {
  const { data: employee } = await supabase
    .from("employees")
    .select(
      "employee_code, job_title, department, country, status, onboarding_date, region_id, project_id, project_name_other"
    )
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return null;

  const [regionRes, projectRes, rolesRes] = await Promise.all([
    employee.region_id
      ? supabase.from("regions").select("name, code").eq("id", employee.region_id).maybeSingle()
      : Promise.resolve({ data: null }),
    employee.project_id
      ? supabase.from("projects").select("name").eq("id", employee.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("employee_roles").select("role, role_custom").eq("employee_id", employeeId),
  ]);

  const roles = [...new Set(
    (rolesRes.data ?? [])
      .map((r) => displayRole(String(r.role ?? ""), (r.role_custom as string | null) ?? null))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const projectFromDb = (projectRes.data?.name as string | null)?.trim() || null;
  const projectOther = (employee.project_name_other as string | null)?.trim() || null;

  return {
    employeeCode: (employee.employee_code as string | null)?.trim() || null,
    roles,
    regionName: (regionRes.data?.name as string | null)?.trim() || null,
    regionCode: (regionRes.data?.code as string | null)?.trim() || null,
    projectName: projectFromDb ?? projectOther,
    jobTitle: (employee.job_title as string | null)?.trim() || null,
    department: (employee.department as string | null)?.trim() || null,
    country: (employee.country as string | null)?.trim() || null,
    status: (employee.status as string | null)?.trim() || null,
    onboardingDate: (employee.onboarding_date as string | null) ?? null,
  };
}
