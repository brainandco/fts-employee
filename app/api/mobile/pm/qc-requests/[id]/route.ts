import { NextResponse } from "next/server";
import { targetEmployeeIsInPmAssignmentScope } from "@/lib/pm-team-assignees";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/**
 * PATCH — PM fulfills or rejects a QC replacement request (Bearer).
 * Body: { status: 'Fulfilled' | 'Rejected', replacement_asset_id?: string }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ctx = await requirePmMobileContext(auth);
  if ("error" in ctx) return ctx.error;

  const { supabase, employee, authUserId } = ctx;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  if (status !== "Fulfilled" && status !== "Rejected") {
    return NextResponse.json({ message: "status must be Fulfilled or Rejected" }, { status: 400 });
  }

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
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    requestRow.for_employee_id,
    authUserId,
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
  const replacement_asset_id =
    typeof body.replacement_asset_id === "string" ? body.replacement_asset_id.trim() || null : null;

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
        assigned_by: authUserId,
        assigned_at: now,
      })
      .eq("id", replacement_asset_id);
    await supabase.from("asset_assignment_history").insert({
      asset_id: replacement_asset_id,
      to_employee_id: requestRow.for_employee_id,
      assigned_by_user_id: authUserId,
      notes: "Replacement assigned by PM from QC request (mobile)",
    });
  }

  await supabase
    .from("asset_replacement_requests")
    .update({
      status,
      resolved_at: now,
      resolved_by_employee_id: employee.id,
      ...(replacement_asset_id && { replacement_asset_id }),
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, message: status === "Fulfilled" ? "Request fulfilled" : "Request rejected" });
}
