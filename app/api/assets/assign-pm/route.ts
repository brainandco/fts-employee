import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * POST /api/assets/assign-pm — PM assigns available assets to one employee (not QC), same region.
 * Body: { asset_ids: string[], employee_id: string }
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId = typeof body.employee_id === "string" ? body.employee_id.trim() : "";
  if (!employeeId || assetIds.length === 0) {
    return NextResponse.json({ message: "asset_ids and employee_id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id")
    .eq("email", email)
    .maybeSingle();
  if (!pmEmployee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", pmEmployee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can assign assets to employees" }, { status: 403 });

  const { data: toEmployee } = await supabase
    .from("employees")
    .select("id, region_id, email, full_name")
    .eq("id", employeeId)
    .single();
  if (!toEmployee) return NextResponse.json({ message: "Target employee not found" }, { status: 404 });
  if (toEmployee.region_id !== pmEmployee.region_id) {
    return NextResponse.json({ message: "You can only assign to employees in your region" }, { status: 400 });
  }

  const { data: disallowedRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", employeeId)
    .in("role", ["QC", "Driver/Rigger"]);
  if ((disallowedRole ?? []).length) {
    return NextResponse.json({ message: "Assets cannot be assigned to QC or Driver/Rigger." }, { status: 400 });
  }

  const { data: availableAssets } = await supabase
    .from("assets")
    .select("id")
    .in("id", assetIds)
    .eq("status", "Available");
  const availableIds = (availableAssets ?? []).map((a) => a.id);
  const now = new Date().toISOString();

  for (const id of availableIds) {
    await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: employeeId,
        status: "Assigned",
        assigned_by: session.user.id,
        assigned_at: now,
      })
      .eq("id", id);
    await supabase.from("asset_assignment_history").insert({
      asset_id: id,
      to_employee_id: employeeId,
      assigned_by_user_id: session.user.id,
      notes: "Assigned by PM from employee portal",
    });
  }

  if (availableIds.length > 0 && toEmployee?.email) {
    const { data: recipient } = await supabase
      .from("users_profile")
      .select("id")
      .eq("email", toEmployee.email)
      .maybeSingle();
    if (recipient?.id) {
      await supabase.from("notifications").insert({
        recipient_user_id: recipient.id,
        title: "Asset assigned to you",
        body: `${availableIds.length} asset(s) were assigned to you by PM.`,
        category: "asset_assignment",
        link: "/dashboard",
        meta: { asset_ids: availableIds, assigned_by: session.user.id },
      });
    }
  }

  return NextResponse.json({
    assigned: availableIds.length,
    skipped: assetIds.length - availableIds.length,
    message: availableIds.length
      ? `Assigned ${availableIds.length} to employee.`
      : "No assets were available to assign.",
  });
}
