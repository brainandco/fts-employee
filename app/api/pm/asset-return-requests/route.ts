import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** PM: pending returns in their region (region_id on the request matches employee.region_id). */
export async function GET() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!employee?.region_id) return NextResponse.json({ pending: [] });

  const { data: roleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roles = new Set((roleRows ?? []).map((r) => r.role));
  const allowed = roles.has("Project Manager") || roles.has("QC");
  if (!allowed) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data: pending, error } = await supabase
    .from("asset_return_requests")
    .select(
      "id, asset_id, from_employee_id, employee_comment, return_image_urls, status, created_at, region_id"
    )
    .eq("status", "pending")
    .eq("region_id", employee.region_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const ids = [...new Set((pending ?? []).map((r) => r.asset_id))];
  const empIds = [...new Set((pending ?? []).map((r) => r.from_employee_id))];

  const { data: assets } = ids.length
    ? await supabase.from("assets").select("id, name, model, serial, imei_1, imei_2, category").in("id", ids)
    : { data: [] };
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };

  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  const rows = (pending ?? []).map((r) => ({
    ...r,
    asset: assetMap.get(r.asset_id) ?? null,
    from_employee_name: empMap.get(r.from_employee_id) ?? null,
  }));

  return NextResponse.json({ pending: rows });
}
