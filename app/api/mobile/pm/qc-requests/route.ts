import { NextResponse } from "next/server";
import { loadPmAvailableReplacementAssets } from "@/lib/mobile/pm-assign-data";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — QC replacement requests in PM region scope (Bearer). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ctx = await requirePmMobileContext(auth);
  if ("error" in ctx) return ctx.error;

  const { supabase, employee, allowedRegionIds, authUserId } = ctx;
  if (!allowedRegionIds.length) return NextResponse.json({ items: [], pendingCount: 0, availableAssets: [] });

  const { data: regionEmps } = await supabase
    .from("employees")
    .select("id")
    .in("region_id", allowedRegionIds)
    .eq("status", "ACTIVE");
  const regionEmpSet = new Set((regionEmps ?? []).map((e) => e.id as string));

  const { data: all } = await supabase
    .from("asset_replacement_requests")
    .select(
      "id, asset_id, for_employee_id, requested_by_employee_id, reason, notes, status, created_at, resolved_at, replacement_asset_id"
    )
    .order("created_at", { ascending: false });

  const filtered = (all ?? []).filter((r) => regionEmpSet.has(r.for_employee_id as string));

  const assetIds = [...new Set(filtered.map((r) => r.asset_id))];
  const empIds = [
    ...new Set(filtered.flatMap((r) => [r.for_employee_id, r.requested_by_employee_id].filter(Boolean) as string[])),
  ];

  const { data: assets } = assetIds.length
    ? await supabase.from("assets").select("id, name, serial, category").in("id", assetIds)
    : { data: [] };
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };

  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  const items = filtered.map((r) => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    notes: r.notes,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    forEmployeeName: empMap.get(r.for_employee_id as string) ?? null,
    requestedByName: empMap.get(r.requested_by_employee_id as string) ?? null,
    asset: assetMap.get(r.asset_id as string) ?? null,
  }));

  const pendingCount = items.filter((i) => i.status === "Pending").length;

  const availableAssets = await loadPmAvailableReplacementAssets(
    supabase,
    { id: employee.id, region_id: employee.region_id, project_id: employee.project_id },
    authUserId
  );

  return NextResponse.json({ items, pendingCount, availableAssets });
}
