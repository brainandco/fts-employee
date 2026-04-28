import { getDataClient } from "@/lib/supabase/server";

const VIEW_ROLES = new Set(["Project Manager", "PP", "Team Lead"]);

type DataClient = Awaited<ReturnType<typeof getDataClient>>;

export async function resolveEmployeeFileAccess(supabase: DataClient, email: string) {
  const { data: employee } = await supabase
    .from("employees")
    .select("id, status, region_id")
    .eq("email", email)
    .maybeSingle();

  if (!employee || employee.status !== "ACTIVE") {
    return { employee: null, canView: false };
  }

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const canView = Array.from(VIEW_ROLES).some((role) => roleSet.has(role));

  return { employee, canView };
}

