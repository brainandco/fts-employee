import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";
import { targetEmployeeIsOnPmTeam, loadPmScopeIds } from "@/lib/pm-team-assignees";
import { resolvePortalAdminAssetAssigner } from "@/lib/portal-asset-assign-auth";
import { upsertPendingReceipts } from "@/lib/resource-receipts";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import type { EhsWearRole } from "@/lib/assets/ehs-tool-catalog";

async function resolveDriverForDt(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  dtEmployeeId: string,
  driverEmployeeId: string | null
) {
  const { data: team } = await supabase
    .from("teams")
    .select("id, driver_rigger_employee_id")
    .eq("dt_employee_id", dtEmployeeId)
    .maybeSingle();

  if (!team?.driver_rigger_employee_id) {
    return { ok: false as const, message: "This DT has no Driver/Rigger on their team." };
  }
  if (driverEmployeeId && driverEmployeeId !== team.driver_rigger_employee_id) {
    return { ok: false as const, message: "Selected driver does not belong to this DT's team." };
  }
  return { ok: true as const, driverId: team.driver_rigger_employee_id as string };
}

/** POST — PM or portal admin assigns EHS tools to a team DT. */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const session = auth.session;

  const body = await req.json().catch(() => ({}));
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((id: unknown) => typeof id === "string") : [];
  const dtEmployeeId = typeof body.dt_employee_id === "string" ? body.dt_employee_id.trim() : "";
  const driverEmployeeId =
    typeof body.driver_employee_id === "string" && body.driver_employee_id.trim()
      ? body.driver_employee_id.trim()
      : null;

  if (!dtEmployeeId || assetIds.length === 0) {
    return NextResponse.json({ message: "asset_ids and dt_employee_id required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();

  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();

  const { data: pmRole } = pmEmployee
    ? await supabase.from("employee_roles").select("role").eq("employee_id", pmEmployee.id).eq("role", "Project Manager").maybeSingle()
    : { data: null };

  const isPm = !!(pmEmployee && pmRole);
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, session.user.id, email);

  if (!isPm && !isPortalAdmin) {
    return NextResponse.json({ message: "Only Project Managers or portal admins can assign EHS tools." }, { status: 403 });
  }

  if (isPm && pmEmployee) {
    const onTeam = await targetEmployeeIsOnPmTeam(supabase, pmEmployee, dtEmployeeId, session.user.id);
    if (!onTeam) {
      return NextResponse.json({ message: "Assign only to a DT on a team in your PM scope." }, { status: 400 });
    }
  }

  const { data: dtEmployee } = await supabase.from("employees").select("id, region_id, email, full_name").eq("id", dtEmployeeId).maybeSingle();
  if (!dtEmployee) return NextResponse.json({ message: "DT not found" }, { status: 404 });

  const { data: assets } = await supabase
    .from("assets")
    .select("id, status, assigned_to_employee_id, ehs_wear_role, is_ehs_tool")
    .in("id", assetIds)
    .eq("is_ehs_tool", true)
    .eq("status", "Available");

  const available = (assets ?? []).filter((a) => !a.assigned_to_employee_id);
  const needsDriver = available.some((a) => a.ehs_wear_role === "driver_rigger");

  let teamDriverId: string | null = null;
  if (needsDriver) {
    const driverResolved = await resolveDriverForDt(supabase, dtEmployeeId, driverEmployeeId);
    if (!driverResolved.ok) return NextResponse.json({ message: driverResolved.message }, { status: 400 });
    teamDriverId = driverResolved.driverId;
  }

  const now = new Date().toISOString();
  const notesTag = isPortalAdmin ? "EHS assigned by admin from employee portal" : "EHS assigned by PM from employee portal";
  const assignedIds: string[] = [];

  for (const row of available) {
    const wearRole = row.ehs_wear_role as EhsWearRole | null;
    await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: dtEmployeeId,
        assigned_region_id: dtEmployee.region_id,
        status: "Assigned",
        assigned_by: session.user.id,
        assigned_at: now,
        ehs_for_employee_id: wearRole === "driver_rigger" ? teamDriverId : null,
      })
      .eq("id", row.id);

    assignedIds.push(row.id as string);
    await supabase.from("asset_assignment_history").insert({
      asset_id: row.id,
      to_employee_id: dtEmployeeId,
      assigned_by_user_id: session.user.id,
      notes:
        wearRole === "driver_rigger" && teamDriverId
          ? `${notesTag} — driver/rigger tool for team driver`
          : `${notesTag} — DT wear tool`,
    });
  }

  if (assignedIds.length > 0) {
    await upsertPendingReceipts(supabase, {
      employeeId: dtEmployeeId,
      assignedByUserId: session.user.id,
      items: assignedIds.map((rid) => ({ resourceType: "asset" as const, resourceId: rid })),
    });

    if (dtEmployee.email) {
      const { data: recipient } = await supabase.from("users_profile").select("id").eq("email", dtEmployee.email).maybeSingle();
      if (recipient?.id) {
        await dispatchNotifications(supabase, [
          {
            recipient_user_id: recipient.id,
            title: "Confirm receipt: EHS tools assigned",
            body: `${assignedIds.length} EHS tool(s) were assigned to you (DT). Confirm receipt when received.`,
            category: "assignment_receipt",
            link: "/dashboard/receipts",
            meta: { asset_ids: assignedIds, assigned_by: session.user.id },
          },
        ]);
      }
    }
  }

  return NextResponse.json({
    assigned: assignedIds.length,
    skipped: assetIds.length - assignedIds.length,
    message: assignedIds.length ? `Assigned ${assignedIds.length} EHS tool(s) to DT.` : "No EHS tools were available.",
  });
}

/** GET teams in PM scope for assign UI */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (auth.session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase.from("employees").select("id, region_id, project_id").eq("email", email).maybeSingle();
  const { data: pmRole } = pmEmployee
    ? await supabase.from("employee_roles").select("role").eq("employee_id", pmEmployee.id).eq("role", "Project Manager").maybeSingle()
    : { data: null };
  const isPm = !!(pmEmployee && pmRole);
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, auth.session.user.id, email);
  if (!isPm && !isPortalAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  let teamsQuery = supabase
    .from("teams")
    .select("id, name, region_id, dt_employee_id, driver_rigger_employee_id")
    .not("dt_employee_id", "is", null)
    .order("name");

  if (isPm && pmEmployee) {
    const { allowedRegionIds } = await loadPmScopeIds(supabase, pmEmployee, auth.session.user.id);
    if (allowedRegionIds.length > 0) teamsQuery = teamsQuery.in("region_id", allowedRegionIds);
  }

  const { data: teamsRaw } = await teamsQuery;
  const empIds = [
    ...new Set(
      (teamsRaw ?? []).flatMap((t) => [t.dt_employee_id, t.driver_rigger_employee_id].filter(Boolean) as string[])
    ),
  ];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name, email, status").in("id", empIds)
    : { data: [] };
  const empMap = new Map(
    (emps ?? []).map((e) => [e.id, { full_name: (e.full_name ?? e.email ?? "—").trim() || "—", status: e.status }])
  );

  const teams = (teamsRaw ?? [])
    .filter((t) => {
      const dt = t.dt_employee_id ? empMap.get(t.dt_employee_id as string) : null;
      return dt && dt.status === "ACTIVE";
    })
    .map((t) => {
      const dt = empMap.get(t.dt_employee_id as string)!;
      const driver = t.driver_rigger_employee_id ? empMap.get(t.driver_rigger_employee_id as string) : null;
      return {
        teamId: t.id as string,
        teamName: (t.name as string)?.trim() || "Team",
        dt: { id: t.dt_employee_id as string, full_name: dt.full_name },
        driver:
          driver && driver.status === "ACTIVE"
            ? { id: t.driver_rigger_employee_id as string, full_name: driver.full_name }
            : null,
      };
    });

  return NextResponse.json({ teams });
}
