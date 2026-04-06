import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Employee uploads condition photos: returns, receipt confirmation (assets), or asset-transfer handover.
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ message: "Invalid form data" }, { status: 400 });

  const purpose = formData.get("purpose");
  const assetId = typeof formData.get("asset_id") === "string" ? String(formData.get("asset_id")).trim() : "";
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ message: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Image must be 5MB or smaller" }, { status: 400 });
  }
  const type = file.type || "";
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ message: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  let subPath = "";
  if (purpose === "asset-return") {
    if (!assetId) return NextResponse.json({ message: "asset_id is required for asset-return" }, { status: 400 });
    const { data: asset } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset || asset.assigned_to_employee_id !== employee.id) {
      return NextResponse.json({ message: "This asset is not assigned to you" }, { status: 403 });
    }
    subPath = `returns/assets/${assetId}/${employee.id}`;
  } else if (purpose === "receipt-confirmation") {
    const rcId =
      typeof formData.get("receipt_confirmation_id") === "string"
        ? String(formData.get("receipt_confirmation_id")).trim()
        : "";
    if (!rcId) {
      return NextResponse.json({ message: "receipt_confirmation_id is required" }, { status: 400 });
    }
    const { data: rc } = await supabase
      .from("resource_receipt_confirmations")
      .select("id, employee_id, status, resource_type, resource_id")
      .eq("id", rcId)
      .maybeSingle();
    if (!rc || rc.employee_id !== employee.id || rc.status !== "pending") {
      return NextResponse.json({ message: "Invalid or expired receipt confirmation" }, { status: 403 });
    }
    if (rc.resource_type !== "asset") {
      return NextResponse.json({ message: "Receipt photos apply only to asset confirmations" }, { status: 400 });
    }
    subPath = `receipts/assets/${rc.resource_id}/${employee.id}`;
  } else if (purpose === "asset-transfer-handover") {
    if (!assetId) return NextResponse.json({ message: "asset_id is required for asset-transfer-handover" }, { status: 400 });
    const { data: asset } = await supabase
      .from("assets")
      .select("id, assigned_to_employee_id, status")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset || asset.assigned_to_employee_id !== employee.id || asset.status !== "Assigned") {
      return NextResponse.json({ message: "Asset must be assigned to you to add handover photos" }, { status: 403 });
    }
    subPath = `transfers/handover/${assetId}/${employee.id}`;
  } else if (purpose === "vehicle-return") {
    const { data: roleRows } = await supabase.from("employee_roles").select("role").eq("employee_id", employee.id);
    const roles = new Set((roleRows ?? []).map((r) => r.role));
    if (!roles.has("Driver/Rigger") && !roles.has("Self DT")) {
      return NextResponse.json({ message: "Only drivers can upload vehicle return photos" }, { status: 403 });
    }
    const { data: assignment } = await supabase
      .from("vehicle_assignments")
      .select("vehicle_id")
      .eq("employee_id", employee.id)
      .maybeSingle();
    if (!assignment?.vehicle_id) {
      return NextResponse.json({ message: "No vehicle assigned" }, { status: 400 });
    }
    subPath = `returns/vehicles/${assignment.vehicle_id}/${employee.id}`;
  } else {
    return NextResponse.json(
      {
        message:
          "purpose must be asset-return, vehicle-return, receipt-confirmation, or asset-transfer-handover",
      },
      { status: 400 }
    );
  }

  const admin = createServerSupabaseAdmin();
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${subPath}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("resource-photos").upload(path, buf, {
    contentType: type,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ message: upErr.message }, { status: 400 });

  const {
    data: { publicUrl },
  } = admin.storage.from("resource-photos").getPublicUrl(path);

  return NextResponse.json({ url: publicUrl });
}
