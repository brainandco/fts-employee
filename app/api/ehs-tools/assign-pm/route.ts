import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { NextResponse } from "next/server";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import { resolvePortalAdminAssetAssigner } from "@/lib/portal-asset-assign-auth";
import { upsertPendingReceipts } from "@/lib/resource-receipts";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import { DRIVER_RIGGER_ROLE } from "@/lib/auth/driver-iqama";

const EHS_ASSIGNEE_ROLES = [DRIVER_RIGGER_ROLE, "Self DT"] as const;

async function assertDriverRigger(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  employeeId: string
) {
  const { data: roles } = await supabase.from("employee_roles").select("role").eq("employee_id", employeeId);
  const set = new Set((roles ?? []).map((r) => r.role as string));
  if (!set.has(DRIVER_RIGGER_ROLE) && !set.has("Self DT")) {
    return {
      ok: false as const,
      message: "EHS tools must be assigned directly to a Driver/Rigger (or Self DT).",
    };
  }
  return { ok: true as const };
}

async function loadEhsDriverOptions(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  opts: { regionIds?: string[]; excludeEmployeeId?: string | null }
) {
  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id, role")
    .in("role", [...EHS_ASSIGNEE_ROLES]);

  const empIds = [...new Set((roleRows ?? []).map((r) => r.employee_id as string))];
  if (empIds.length === 0) return [] as { id: string; full_name: string; region_id: string | null }[];

  let q = supabase
    .from("employees")
    .select("id, full_name, email, region_id, status")
    .in("id", empIds)
    .eq("status", "ACTIVE");

  if (opts.regionIds?.length) q = q.in("region_id", opts.regionIds);
  if (opts.excludeEmployeeId) q = q.neq("id", opts.excludeEmployeeId);

  const { data: emps } = await q.order("full_name");
  return (emps ?? []).map((e) => ({
    id: e.id as string,
    full_name: ((e.full_name as string | null) ?? (e.email as string | null) ?? "Driver/Rigger").trim(),
    region_id: (e.region_id as string | null) ?? null,
  }));
}

/** POST — PM or portal admin assigns EHS tools directly to a Driver/Rigger. */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const session = auth.session;

  const body = await req.json().catch(() => ({}));
  const assetIds = Array.isArray(body.asset_ids) ? body.asset_ids.filter((id: unknown) => typeof id === "string") : [];
  const employeeId =
    typeof body.employee_id === "string"
      ? body.employee_id.trim()
      : typeof body.driver_employee_id === "string"
        ? body.driver_employee_id.trim()
        : "";

  if (!employeeId || assetIds.length === 0) {
    return NextResponse.json({ message: "asset_ids and employee_id (Driver/Rigger) required" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim();

  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();

  const { data: pmRole } = pmEmployee
    ? await supabase
        .from("employee_roles")
        .select("role")
        .eq("employee_id", pmEmployee.id)
        .eq("role", "Project Manager")
        .maybeSingle()
    : { data: null };

  const isPm = !!(pmEmployee && pmRole);
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, session.user.id, email);

  if (!isPm && !isPortalAdmin) {
    return NextResponse.json({ message: "Only Project Managers or portal admins can assign EHS tools." }, { status: 403 });
  }

  const roleCheck = await assertDriverRigger(supabase, employeeId);
  if (!roleCheck.ok) return NextResponse.json({ message: roleCheck.message }, { status: 400 });

  if (isPm && pmEmployee) {
    const { allowedRegionIds } = await loadPmScopeIds(supabase, pmEmployee, session.user.id);
    const drivers = await loadEhsDriverOptions(supabase, {
      regionIds: allowedRegionIds,
      excludeEmployeeId: pmEmployee.id,
    });
    if (!drivers.some((d) => d.id === employeeId)) {
      return NextResponse.json(
        { message: "Assign only to a Driver/Rigger in your PM region scope." },
        { status: 400 }
      );
    }
  }

  const { data: driver } = await supabase
    .from("employees")
    .select("id, region_id, email, full_name, status")
    .eq("id", employeeId)
    .maybeSingle();
  if (!driver || driver.status !== "ACTIVE") {
    return NextResponse.json({ message: "Driver/Rigger not found or inactive." }, { status: 404 });
  }
  if (!driver.region_id) {
    return NextResponse.json(
      { message: "Driver/Rigger needs a primary region before EHS tools can be assigned." },
      { status: 400 }
    );
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id, status, assigned_to_employee_id, is_ehs_tool")
    .in("id", assetIds)
    .eq("is_ehs_tool", true)
    .eq("status", "Available");

  const available = (assets ?? []).filter((a) => !a.assigned_to_employee_id);
  const now = new Date().toISOString();
  const notesTag = isPortalAdmin
    ? "EHS assigned by admin from employee portal (direct to driver)"
    : "EHS assigned by PM from employee portal (direct to driver)";
  const assignedIds: string[] = [];

  for (const row of available) {
    await supabase
      .from("assets")
      .update({
        assigned_to_employee_id: employeeId,
        assigned_region_id: driver.region_id,
        status: "Assigned",
        assigned_by: session.user.id,
        assigned_at: now,
        ehs_wear_role: "driver_rigger",
        ehs_for_employee_id: null,
      })
      .eq("id", row.id);

    assignedIds.push(row.id as string);
    await supabase.from("asset_assignment_history").insert({
      asset_id: row.id,
      to_employee_id: employeeId,
      assigned_by_user_id: session.user.id,
      notes: notesTag,
    });
  }

  if (assignedIds.length > 0) {
    await upsertPendingReceipts(supabase, {
      employeeId,
      assignedByUserId: session.user.id,
      items: assignedIds.map((rid) => ({ resourceType: "asset" as const, resourceId: rid })),
    });

    if (driver.email) {
      const { data: recipient } = await supabase.from("users_profile").select("id").eq("email", driver.email).maybeSingle();
      if (recipient?.id) {
        await dispatchNotifications(supabase, [
          {
            recipient_user_id: recipient.id,
            title: "Confirm receipt: EHS tools assigned",
            body: `${assignedIds.length} EHS tool(s) were assigned to you. Confirm receipt when received.`,
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
    message: assignedIds.length
      ? `Assigned ${assignedIds.length} EHS tool(s) to Driver/Rigger.`
      : "No EHS tools were available.",
  });
}

/** GET Driver/Riggers in PM/admin scope for EHS assign UI — no teams. */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const supabase = await getDataClient();
  const email = (auth.session.user.email ?? "").trim();
  const { data: pmEmployee } = await supabase
    .from("employees")
    .select("id, region_id, project_id")
    .eq("email", email)
    .maybeSingle();
  const { data: pmRole } = pmEmployee
    ? await supabase
        .from("employee_roles")
        .select("role")
        .eq("employee_id", pmEmployee.id)
        .eq("role", "Project Manager")
        .maybeSingle()
    : { data: null };
  const isPm = !!(pmEmployee && pmRole);
  const isPortalAdmin = await resolvePortalAdminAssetAssigner(supabase, auth.session.user.id, email);
  if (!isPm && !isPortalAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  if (isPortalAdmin && !isPm) {
    const drivers = await loadEhsDriverOptions(supabase, {});
    return NextResponse.json({ drivers });
  }

  if (!pmEmployee) return NextResponse.json({ drivers: [] });

  const { allowedRegionIds } = await loadPmScopeIds(supabase, pmEmployee, auth.session.user.id);
  const drivers = await loadEhsDriverOptions(supabase, {
    regionIds: allowedRegionIds,
    excludeEmployeeId: pmEmployee.id,
  });

  return NextResponse.json({ drivers });
}
