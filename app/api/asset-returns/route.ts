import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { canEmployeeInitiateAssetReturn } from "@/lib/asset-return-eligibility";
import { NextResponse } from "next/server";
import { notifyPmAndQcInRegion } from "@/lib/notifyRegionStaff";
import { deleteReceiptForResource } from "@/lib/resource-receipts";
import { hasMinimumPhotos, parseImageUrlArray } from "@/lib/resource-photos";

/**
 * Employee returns an asset assigned to them (Assigned, Under_Maintenance, or Damaged — still in their custody).
 * QC, PM, QA, and other roles use the same flow when the asset is assigned to their employee row.
 * Creates asset_return_requests (pending) and sets asset to Pending_Return, unassigned.
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : "";
  const employee_comment = typeof body.employee_comment === "string" ? body.employee_comment.trim() : "";
  const returnUrls = parseImageUrlArray(body.return_image_urls);
  if (!assetId) return NextResponse.json({ message: "asset_id required" }, { status: 400 });
  if (!employee_comment) return NextResponse.json({ message: "employee_comment is required" }, { status: 400 });
  if (!hasMinimumPhotos(returnUrls)) {
    return NextResponse.json({ message: "At least 2 condition photos are required when returning an asset." }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: asset, error: aErr } = await supabase
    .from("assets")
    .select("id, assigned_to_employee_id, status, assigned_region_id")
    .eq("id", assetId)
    .single();

  if (aErr || !asset) return NextResponse.json({ message: "Asset not found" }, { status: 404 });
  if (asset.assigned_to_employee_id !== employee.id) {
    return NextResponse.json({ message: "This asset is not assigned to you" }, { status: 403 });
  }
  if (!canEmployeeInitiateAssetReturn(asset.status)) {
    return NextResponse.json(
      {
        message:
          "Only assets still in your custody can be returned (Assigned, With_QC, under maintenance, or damaged). If this asset is already in the return queue, wait for PM/QC.",
      },
      { status: 400 }
    );
  }

  const { data: existingPending } = await supabase
    .from("asset_return_requests")
    .select("id")
    .eq("asset_id", assetId)
    .eq("status", "pending")
    .maybeSingle();
  if (existingPending) {
    return NextResponse.json({ message: "A return for this asset is already pending" }, { status: 400 });
  }

  const region_id = asset.assigned_region_id ?? employee.region_id ?? null;

  const { error: insErr } = await supabase.from("asset_return_requests").insert({
    asset_id: assetId,
    from_employee_id: employee.id,
    region_id,
    employee_comment,
    return_image_urls: returnUrls,
    status: "pending",
  });

  if (insErr) return NextResponse.json({ message: insErr.message }, { status: 400 });

  const { error: updErr } = await supabase
    .from("assets")
    .update({
      status: "Pending_Return",
      assigned_to_employee_id: null,
      assigned_by: null,
      assigned_at: null,
    })
    .eq("id", assetId);

  if (updErr) return NextResponse.json({ message: updErr.message }, { status: 400 });

  await deleteReceiptForResource(supabase, "asset", assetId);

  if (region_id) {
    await notifyPmAndQcInRegion(supabase, region_id, {
      title: "Asset return pending review",
      body: "An employee has returned an asset. Please review in Asset return queue (PM) and confirm handover with QC as needed.",
      category: "asset_return",
      link: "/dashboard/asset-returns",
      meta: { asset_id: assetId, from_employee_id: employee.id },
    });
  }

  return NextResponse.json({ ok: true });
}
