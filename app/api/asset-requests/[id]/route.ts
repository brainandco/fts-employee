import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { targetEmployeeIsInPmAssignmentScope } from "@/lib/pm-team-assignees";

/**
 * PATCH: PM fulfills or rejects a QC replacement request.
 * Body: { status: 'Fulfilled' | 'Rejected', replacement_asset_id?: string }
 * When Fulfilled with replacement_asset_id, assigns that asset to the request's for_employee_id.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  if (status !== "Fulfilled" && status !== "Rejected") {
    return NextResponse.json({ message: "status must be Fulfilled or Rejected" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  if (!pmEmployee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: pmRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", pmEmployee.id)
    .eq("role", "Project Manager")
    .maybeSingle();
  if (!pmRole) return NextResponse.json({ message: "Only Project Managers can resolve requests" }, { status: 403 });

  const { data: requestRow } = await supabase
    .from("asset_replacement_requests")
    .select("id, for_employee_id, status, asset_id")
    .eq("id", id)
    .single();
  if (!requestRow) return NextResponse.json({ message: "Request not found" }, { status: 404 });
  if (requestRow.status !== "Pending") {
    return NextResponse.json({ message: "Request already resolved" }, { status: 400 });
  }

  const inScope = await targetEmployeeIsInPmAssignmentScope(
    supabase,
    pmEmployee,
    requestRow.for_employee_id,
    session.user.id,
    { excludeQc: false, requireVehicleRoles: false }
  );
  if (!inScope) {
    return NextResponse.json(
      {
        message:
          "This request is not for someone in your scope (team DT/Driver-Rigger, or an employee in one of your regions).",
      },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const replacement_asset_id = typeof body.replacement_asset_id === "string" ? body.replacement_asset_id.trim() || null : null;

  if (status === "Fulfilled" && replacement_asset_id) {
    const { data: replacementAsset } = await supabase
      .from("assets")
      .select("id, status")
      .eq("id", replacement_asset_id)
      .single();
    if (!replacementAsset) return NextResponse.json({ message: "Replacement asset not found" }, { status: 404 });
    if (replacementAsset.status !== "Available") {
      return NextResponse.json({ message: "Replacement asset is not available" }, { status: 400 });
    }
    await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: requestRow.for_employee_id,
        status: "Assigned",
        assigned_by: session.user.id,
        assigned_at: now,
      })
      .eq("id", replacement_asset_id);
    await supabase.from("asset_assignment_history").insert({
      asset_id: replacement_asset_id,
      to_employee_id: requestRow.for_employee_id,
      assigned_by_user_id: session.user.id,
      notes: "Replacement assigned by PM from QC request",
    });
  }

  await supabase
    .from("asset_replacement_requests")
    .update({
      status,
      resolved_at: now,
      resolved_by_employee_id: pmEmployee.id,
      ...(replacement_asset_id && { replacement_asset_id }),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, message: status === "Fulfilled" ? "Request fulfilled" : "Request rejected" });
}
