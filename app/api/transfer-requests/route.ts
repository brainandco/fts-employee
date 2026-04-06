import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { hasMinimumPhotos, parseImageUrlArray } from "@/lib/resource-photos";
import { NextResponse } from "next/server";
type TransferType = "vehicle_swap" | "vehicle_replacement" | "drive_swap" | "asset_transfer";

const REQUEST_TYPES: TransferType[] = ["vehicle_swap", "vehicle_replacement", "drive_swap", "asset_transfer"];

export async function GET() {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isSelfDt = roleSet.has("Self DT");
  const canRequest =
    roleSet.has("DT") || roleSet.has("Driver/Rigger") || isSelfDt;
  const canReview = roleSet.has("QC") || roleSet.has("Project Manager");
  const isPm = roleSet.has("Project Manager");

  let query = supabase.from("transfer_requests").select("*").order("created_at", { ascending: false });
  if (canReview) {
    if (isPm) {
      const { allowedRegionIds } = await loadPmScopeIds(
        supabase,
        { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
        session.user.id
      );
      if (allowedRegionIds.length === 0) {
        query = query.eq("requester_employee_id", employee.id);
      } else if (allowedRegionIds.length === 1) {
        query = query.or(
          `requester_employee_id.eq.${employee.id},requester_region_id.eq.${allowedRegionIds[0]}`
        );
      } else {
        query = query.or(
          `requester_employee_id.eq.${employee.id},requester_region_id.in.(${allowedRegionIds.join(",")})`
        );
      }
    } else {
      query = query.or(
        `requester_employee_id.eq.${employee.id},requester_region_id.eq.${employee.region_id}`
      );
    }
  } else {
    query = query.eq("requester_employee_id", employee.id);
  }

  const { data: all } = await query;
  return NextResponse.json({ requests: all ?? [], canRequest, canReview });
}

export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const request_type_input = typeof body.request_type === "string" ? body.request_type : "";
  const request_reason = typeof body.request_reason === "string" ? body.request_reason.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!REQUEST_TYPES.includes(request_type_input as TransferType) || !request_reason) {
    return NextResponse.json({ message: "Valid request_type and request_reason are required" }, { status: 400 });
  }
  const request_type = request_type_input as TransferType;

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id, full_name").eq("email", email).maybeSingle();
  if (!employee?.region_id) return NextResponse.json({ message: "Employee or region not found" }, { status: 403 });

  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
  const roleSet = new Set((roles ?? []).map((r) => r.role));
  const isSelfDt = roleSet.has("Self DT");
  const isDt = roleSet.has("DT") || isSelfDt;
  const isDriver = roleSet.has("Driver/Rigger") || isSelfDt;
  if (!isDt && !isDriver) {
    return NextResponse.json({ message: "Only DT, Driver/Rigger, or Self DT can create transfer requests" }, { status: 403 });
  }

  let target_employee_id: string | null = null;
  let target_team_id: string | null = null;
  let asset_id: string | null = null;
  const payload: Record<string, string> = {};

  const targetEmployeeIdInput = typeof body.target_employee_id === "string" ? body.target_employee_id.trim() : "";
  const targetTeamIdInput = typeof body.target_team_id === "string" ? body.target_team_id.trim() : "";
  const assetIdInput = typeof body.asset_id === "string" ? body.asset_id.trim() : "";

  if (request_type === "vehicle_swap") {
    if (!targetEmployeeIdInput) return NextResponse.json({ message: "Target driver is required for vehicle swap" }, { status: 400 });
    const { data: targetEmp } = await supabase.from("employees").select("id, region_id").eq("id", targetEmployeeIdInput).single();
    if (!targetEmp || targetEmp.region_id !== employee.region_id || targetEmp.id === employee.id) {
      return NextResponse.json({ message: "Target driver must be active in your region" }, { status: 400 });
    }
    const { data: targetRoleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", targetEmp.id);
    const targetOkDriver = (targetRoleRows ?? []).some(
      (r) => r.role === "Driver/Rigger" || r.role === "Self DT"
    );
    if (!targetOkDriver) return NextResponse.json({ message: "Target employee must be Driver/Rigger or Self DT" }, { status: 400 });
    target_team_id = null;
    const { data: ownVehicle } = await supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", employee.id).maybeSingle();
    const { data: targetVehicle } = await supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", targetEmp.id).maybeSingle();
    if (!ownVehicle?.vehicle_id || !targetVehicle?.vehicle_id) {
      return NextResponse.json({ message: "Both drivers must have assigned vehicles for swap" }, { status: 400 });
    }
    target_employee_id = targetEmp.id;
    payload.own_vehicle_id = ownVehicle.vehicle_id;
    payload.target_vehicle_id = targetVehicle.vehicle_id;
  }

  if (request_type === "vehicle_replacement") {
    const { data: ownVehicle } = await supabase.from("vehicle_assignments").select("vehicle_id").eq("employee_id", employee.id).maybeSingle();
    if (!ownVehicle?.vehicle_id) {
      return NextResponse.json({ message: "No assigned vehicle found for replacement request" }, { status: 400 });
    }
    payload.own_vehicle_id = ownVehicle.vehicle_id;
  }

  if (request_type === "drive_swap") {
    if (!isDriver) return NextResponse.json({ message: "Only Driver/Rigger can request drive swap" }, { status: 400 });
    if (!targetTeamIdInput) return NextResponse.json({ message: "Target team is required for drive swap" }, { status: 400 });

    const { data: ownTeam } = await supabase
      .from("teams")
      .select("id, region_id, driver_rigger_employee_id")
      .eq("driver_rigger_employee_id", employee.id)
      .maybeSingle();
    if (!ownTeam) return NextResponse.json({ message: "Your team record was not found" }, { status: 400 });

    const { data: targetTeam } = await supabase
      .from("teams")
      .select("id, region_id, driver_rigger_employee_id")
      .eq("id", targetTeamIdInput)
      .single();
    if (!targetTeam || targetTeam.region_id !== employee.region_id || !targetTeam.driver_rigger_employee_id || targetTeam.id === ownTeam.id) {
      return NextResponse.json({ message: "Target team must be in your region and have a driver/rigger" }, { status: 400 });
    }
    target_team_id = targetTeam.id;
    target_employee_id = targetTeam.driver_rigger_employee_id;
    payload.requester_team_id = ownTeam.id;
    payload.target_driver_id = targetTeam.driver_rigger_employee_id;
  }

  const handoverUrls = parseImageUrlArray(body.handover_image_urls);

  if (request_type === "asset_transfer") {
    if (!isDt) return NextResponse.json({ message: "Only DT can request asset transfer" }, { status: 400 });
    if (!assetIdInput || !targetEmployeeIdInput) {
      return NextResponse.json({ message: "Asset and target DT are required" }, { status: 400 });
    }
    if (!hasMinimumPhotos(handoverUrls)) {
      return NextResponse.json(
        { message: "At least 2 photos of the asset’s current condition are required for a transfer request." },
        { status: 400 }
      );
    }
    const { data: targetEmp } = await supabase.from("employees").select("id, region_id").eq("id", targetEmployeeIdInput).single();
    if (!targetEmp || targetEmp.region_id !== employee.region_id || targetEmp.id === employee.id) {
      return NextResponse.json({ message: "Target DT must be in your region" }, { status: 400 });
    }
    const { data: targetRoleRowsAt } = await supabase.from("employee_roles").select("role").eq("employee_id", targetEmp.id);
    const targetOkDt = (targetRoleRowsAt ?? []).some((r) => r.role === "DT" || r.role === "Self DT");
    if (!targetOkDt) return NextResponse.json({ message: "Target employee must be DT or Self DT" }, { status: 400 });
    target_team_id = null;

    const { data: asset } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id, status")
      .eq("id", assetIdInput)
      .single();
    if (!asset || asset.assigned_to_employee_id !== employee.id || asset.status !== "Assigned") {
      return NextResponse.json({ message: "Selected asset must be assigned to you" }, { status: 400 });
    }
    target_employee_id = targetEmp.id;
    asset_id = asset.id;
  }

  if (request_type !== "asset_transfer" && handoverUrls.length > 0) {
    return NextResponse.json({ message: "Handover photos apply only to asset transfer requests." }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("transfer_requests")
    .insert({
      request_type,
      requester_employee_id: employee.id,
      requester_region_id: employee.region_id,
      target_employee_id,
      target_team_id,
      asset_id,
      request_reason,
      notes: notes || null,
      payload_json: payload,
      handover_image_urls: request_type === "asset_transfer" ? handoverUrls : [],
      status: "Pending",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const { data: reviewers } = await supabase
    .from("employee_roles")
    .select("employee_id, role")
    .in("role", ["QC", "Project Manager"]);
  const reviewerEmployeeIds = [...new Set((reviewers ?? []).map((r) => r.employee_id))];
  const { data: reviewerEmployees } = reviewerEmployeeIds.length
    ? await supabase.from("employees").select("id, email, region_id").in("id", reviewerEmployeeIds)
    : { data: [] };
  const reviewerEmails = (reviewerEmployees ?? [])
    .filter((e) => e.region_id === employee.region_id)
    .map((e) => e.email)
    .filter(Boolean);
  const { data: reviewerUsers } = reviewerEmails.length
    ? await supabase.from("users_profile").select("id").in("email", reviewerEmails)
    : { data: [] };
  const notificationRows = (reviewerUsers ?? []).map((u) => ({
    recipient_user_id: u.id,
    title: "New transfer request",
    body: `${employee.full_name} submitted ${request_type.replaceAll("_", " ")} request.`,
    category: "transfer_request",
    link: "/dashboard/transfer-requests",
    meta: { transfer_request_id: inserted.id, request_type },
  }));
  if (notificationRows.length) await supabase.from("notifications").insert(notificationRows);

  return NextResponse.json({ id: inserted.id, message: "Transfer request submitted" });
}
