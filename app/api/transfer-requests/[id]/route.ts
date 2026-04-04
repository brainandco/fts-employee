import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type PendingTransfer = {
  id: string;
  request_type: "vehicle_swap" | "vehicle_replacement" | "drive_swap" | "asset_transfer";
  requester_employee_id: string;
  requester_region_id: string;
  target_employee_id: string | null;
  target_team_id: string | null;
  asset_id: string | null;
  request_reason: string;
  payload_json: Record<string, string> | null;
  status: "Pending" | "Accepted" | "Rejected";
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const reviewer_comment = typeof body.reviewer_comment === "string" ? body.reviewer_comment.trim() : "";
  if (!["accept", "reject"].includes(action)) {
    return NextResponse.json({ message: "action must be accept or reject" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: reviewer } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!reviewer?.region_id) return NextResponse.json({ message: "Reviewer employee not found" }, { status: 403 });
  const { data: reviewerRole } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", reviewer.id)
    .in("role", ["QC", "Project Manager"]);
  if (!(reviewerRole ?? []).length) {
    return NextResponse.json({ message: "Only QC/PM can review transfer requests" }, { status: 403 });
  }

  const { data: requestRow } = await supabase.from("transfer_requests").select("*").eq("id", id).single();
  if (!requestRow) return NextResponse.json({ message: "Request not found" }, { status: 404 });
  const requestData = requestRow as PendingTransfer;
  if (requestData.status !== "Pending") return NextResponse.json({ message: "Request already processed" }, { status: 400 });
  if (requestData.requester_region_id !== reviewer.region_id) {
    return NextResponse.json({ message: "You can only review your region requests" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    if (requestData.request_type === "vehicle_swap") {
      const targetEmployeeId = requestData.target_employee_id;
      if (!targetEmployeeId) return NextResponse.json({ message: "Target employee missing for swap" }, { status: 400 });
      const { data: ownAssign } = await supabase
        .from("vehicle_assignments")
        .select("vehicle_id, employee_id")
        .eq("employee_id", requestData.requester_employee_id)
        .single();
      const { data: targetAssign } = await supabase
        .from("vehicle_assignments")
        .select("vehicle_id, employee_id")
        .eq("employee_id", targetEmployeeId)
        .single();
      if (!ownAssign?.vehicle_id || !targetAssign?.vehicle_id) {
        return NextResponse.json({ message: "Both drivers must still have assigned vehicles" }, { status: 400 });
      }
      await supabase.from("vehicle_assignments").delete().in("vehicle_id", [ownAssign.vehicle_id, targetAssign.vehicle_id]);
      const { error: insertErr } = await supabase.from("vehicle_assignments").insert([
        { vehicle_id: ownAssign.vehicle_id, employee_id: targetEmployeeId },
        { vehicle_id: targetAssign.vehicle_id, employee_id: requestData.requester_employee_id },
      ]);
      if (insertErr) return NextResponse.json({ message: insertErr.message }, { status: 400 });
    }

    if (requestData.request_type === "vehicle_replacement") {
      const replacement_vehicle_id =
        typeof body.replacement_vehicle_id === "string" ? body.replacement_vehicle_id.trim() : "";
      if (!replacement_vehicle_id) {
        return NextResponse.json({ message: "replacement_vehicle_id is required for vehicle replacement" }, { status: 400 });
      }

      const { data: ownAssign } = await supabase
        .from("vehicle_assignments")
        .select("vehicle_id")
        .eq("employee_id", requestData.requester_employee_id)
        .single();
      if (!ownAssign?.vehicle_id) return NextResponse.json({ message: "Requester has no current vehicle" }, { status: 400 });

      const { data: replacementVehicle } = await supabase
        .from("vehicles")
        .select("id, status, assigned_region_id, assignment_type")
        .eq("id", replacement_vehicle_id)
        .single();
      if (!replacementVehicle) return NextResponse.json({ message: "Replacement vehicle not found" }, { status: 404 });
      if (replacementVehicle.status !== "Available") {
        return NextResponse.json({ message: "Replacement vehicle is not available" }, { status: 400 });
      }
      if (replacementVehicle.assignment_type !== "Temporary") {
        return NextResponse.json({ message: "Only Temporary vehicles can be used for replacement" }, { status: 400 });
      }
      if (replacementVehicle.assigned_region_id && replacementVehicle.assigned_region_id !== reviewer.region_id) {
        return NextResponse.json({ message: "Replacement vehicle must be in your region" }, { status: 400 });
      }

      await supabase
        .from("vehicles")
        .update({
          status: "Under_Maintenance",
          assigned_by: session.user.id,
          assigned_at: now,
        })
        .eq("id", ownAssign.vehicle_id);
      await supabase.from("vehicle_assignments").delete().eq("vehicle_id", ownAssign.vehicle_id);

      await supabase.from("vehicle_assignments").insert({
        vehicle_id: replacement_vehicle_id,
        employee_id: requestData.requester_employee_id,
      });
      await supabase
        .from("vehicles")
        .update({
          status: "Assigned",
          assigned_region_id: reviewer.region_id,
          assigned_by: session.user.id,
          assigned_at: now,
        })
        .eq("id", replacement_vehicle_id);
    }

    if (requestData.request_type === "drive_swap") {
      const targetEmployeeId = requestData.target_employee_id;
      if (!targetEmployeeId) return NextResponse.json({ message: "Target driver missing for drive swap" }, { status: 400 });

      const { data: ownTeam } = await supabase
        .from("teams")
        .select("id, driver_rigger_employee_id, region_id")
        .eq("driver_rigger_employee_id", requestData.requester_employee_id)
        .maybeSingle();
      const { data: targetTeam } = await supabase
        .from("teams")
        .select("id, driver_rigger_employee_id, region_id")
        .eq("driver_rigger_employee_id", targetEmployeeId)
        .maybeSingle();

      if (
        !ownTeam?.id ||
        !targetTeam?.id ||
        ownTeam.region_id !== reviewer.region_id ||
        targetTeam.region_id !== reviewer.region_id ||
        !targetTeam.driver_rigger_employee_id
      ) {
        return NextResponse.json({ message: "Drive swap participants are not valid anymore" }, { status: 400 });
      }

      await supabase.from("teams").update({ driver_rigger_employee_id: targetTeam.driver_rigger_employee_id }).eq("id", ownTeam.id);
      await supabase.from("teams").update({ driver_rigger_employee_id: requestData.requester_employee_id }).eq("id", targetTeam.id);
    }

    if (requestData.request_type === "asset_transfer") {
      if (!requestData.asset_id || !requestData.target_employee_id) {
        return NextResponse.json({ message: "Asset transfer target is incomplete" }, { status: 400 });
      }
      const { data: asset } = await supabase
        .from("assets")
        .select("id, status, assigned_to_employee_id")
        .eq("id", requestData.asset_id)
        .single();
      if (!asset || asset.status !== "Assigned" || asset.assigned_to_employee_id !== requestData.requester_employee_id) {
        return NextResponse.json({ message: "Asset is no longer assigned to requester" }, { status: 400 });
      }
      await supabase
        .from("assets")
        .update({
          assigned_to_employee_id: requestData.target_employee_id,
          assigned_by: session.user.id,
          assigned_at: now,
          status: "Assigned",
        })
        .eq("id", requestData.asset_id);
      await supabase.from("asset_assignment_history").insert({
        asset_id: requestData.asset_id,
        to_employee_id: requestData.target_employee_id,
        assigned_by_user_id: session.user.id,
        notes: "Transfer request accepted by QC/PM",
      });
    }
  }

  const finalStatus = action === "accept" ? "Accepted" : "Rejected";
  const { error: updateErr } = await supabase
    .from("transfer_requests")
    .update({
      status: finalStatus,
      reviewed_by_employee_id: reviewer.id,
      reviewer_comment: reviewer_comment || null,
      reviewed_at: now,
    })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ message: updateErr.message }, { status: 400 });

  const { data: requester } = await supabase.from("employees").select("email").eq("id", requestData.requester_employee_id).single();
  if (requester?.email) {
    const { data: requesterUser } = await supabase.from("users_profile").select("id").eq("email", requester.email).maybeSingle();
    if (requesterUser?.id) {
      await supabase.from("notifications").insert({
        recipient_user_id: requesterUser.id,
        title: `Transfer request ${finalStatus.toLowerCase()}`,
        body: `Your ${requestData.request_type.replaceAll("_", " ")} request has been ${finalStatus.toLowerCase()}.`,
        category: "transfer_request",
        link: "/dashboard/transfer-requests",
        meta: { transfer_request_id: requestData.id, status: finalStatus },
      });
    }
  }

  return NextResponse.json({ ok: true, status: finalStatus });
}
