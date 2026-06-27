import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { loadPmScopeIds } from "@/lib/pm-team-assignees";
import {
  loadEmployeeIdsInRegions,
  loadReceiptConfirmationsForScope,
} from "@/lib/receipt-confirmations/load-receipt-confirmations";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — receipt confirmation oversight for PM (region scope) or admin_view (all). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind === "denied") {
    return NextResponse.json({ message: access.message }, { status: 403 });
  }

  const supabase = await getDataClient();
  let scopeLabel = "your regions";
  let rows;

  if (access.kind === "admin_view") {
    scopeLabel = "all regions";
    rows = await loadReceiptConfirmationsForScope(supabase, null);
  } else {
    const { data: employee } = await supabase
      .from("employees")
      .select("id, region_id, project_id, status")
      .eq("id", access.employeeId)
      .maybeSingle();

    if (!employee || employee.status !== "ACTIVE") {
      return NextResponse.json({ message: "Employee not active" }, { status: 403 });
    }

    const { data: roleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
    const isPm = (roleRows ?? []).some((r) => r.role === "Project Manager");
    if (!isPm) {
      return NextResponse.json({ message: "Project Manager access required" }, { status: 403 });
    }

    const { allowedRegionIds } = await loadPmScopeIds(
      supabase,
      { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
      auth.user.id
    );

    const scopeEmployeeIds = await loadEmployeeIdsInRegions(supabase, allowedRegionIds);
    rows = await loadReceiptConfirmationsForScope(supabase, scopeEmployeeIds);

    if (allowedRegionIds.length === 1) {
      const { data: region } = await supabase.from("regions").select("name").eq("id", allowedRegionIds[0]!).maybeSingle();
      scopeLabel = region?.name ?? "your region";
    }
  }

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;

  return NextResponse.json({
    scopeLabel,
    pendingCount,
    confirmedCount,
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      typeLabel: r.typeLabel,
      resourceLabel: r.resourceLabel,
      employeeName: r.employeeName,
      assignedAt: r.assignedAt,
      confirmedAt: r.confirmedAt,
      confirmationMessage: r.confirmationMessage,
      assignerName: r.assignerName,
      receiptPhotoCount: r.receiptPhotoUrls.length,
      resourceType: r.resourceType,
    })),
  });
}
