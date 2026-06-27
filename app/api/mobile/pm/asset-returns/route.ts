import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { requirePmMobileContext } from "@/lib/mobile/require-pm-mobile";

/** GET — pending asset returns in PM scope (Bearer). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const ctx = await requirePmMobileContext(auth);
  if ("error" in ctx) return ctx.error;

  const { supabase, allowedRegionIds } = ctx;
  if (!allowedRegionIds.length) return NextResponse.json({ pending: [] });

  let pendingQuery = supabase
    .from("asset_return_requests")
    .select("id, asset_id, from_employee_id, employee_comment, return_image_urls, status, created_at, region_id")
    .eq("status", "pending");
  pendingQuery =
    allowedRegionIds.length === 1
      ? pendingQuery.eq("region_id", allowedRegionIds[0]!)
      : pendingQuery.in("region_id", allowedRegionIds);

  const { data: pending, error } = await pendingQuery.order("created_at", { ascending: true });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  const ids = [...new Set((pending ?? []).map((r) => r.asset_id))];
  const empIds = [...new Set((pending ?? []).map((r) => r.from_employee_id))];

  const { data: assets } = ids.length
    ? await supabase.from("assets").select("id, name, model, serial, category").in("id", ids)
    : { data: [] };
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };

  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const empMap = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  const rows = (pending ?? []).map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    fromEmployeeId: r.from_employee_id,
    fromEmployeeName: empMap.get(r.from_employee_id) ?? null,
    employeeComment: r.employee_comment,
    returnImageCount: Array.isArray(r.return_image_urls) ? r.return_image_urls.length : 0,
    createdAt: r.created_at,
    asset: assetMap.get(r.asset_id) ?? null,
  }));

  return NextResponse.json({ pending: rows });
}
