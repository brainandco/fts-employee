import { randomUUID } from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadResourcePhotosBuffer } from "@/lib/supabase/upload-resource-photos";

const MAX_BYTES = 15 * 1024 * 1024;

/** Requester uploads signed performa PDF after admin approval. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ message: "Invalid form data" }, { status: 400 });

  const message = String(formData.get("message") ?? "").trim();
  const file = formData.get("file");
  if (!message) return NextResponse.json({ message: "Message is required (e.g. confirm the performa is filled and signed)." }, { status: 400 });
  if (!file || !(file instanceof File)) return NextResponse.json({ message: "Signed PDF file is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: "PDF must be 15MB or smaller" }, { status: 400 });
  const mime = file.type || "";
  if (mime !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ message: "Please upload a PDF file" }, { status: 400 });
  }

  const dataClient = await getDataClient();
  const { data: approval } = await dataClient
    .from("approvals")
    .select("id, requester_id, status, payload_json")
    .eq("id", id)
    .eq("approval_type", "leave_request")
    .maybeSingle();

  if (!approval) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (approval.requester_id !== session.user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  if (approval.status !== "Awaiting_Signed_Performa") {
    return NextResponse.json({ message: "This leave request is not waiting for a signed performa upload." }, { status: 400 });
  }

  const admin = createServerSupabaseAdmin();
  const path = `leave-performa/signed/${id}/${randomUUID()}.pdf`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await uploadResourcePhotosBuffer(admin, path, buf, "application/pdf", { upsert: false });
  if (upErr) return NextResponse.json({ message: upErr.message }, { status: 400 });
  const {
    data: { publicUrl },
  } = admin.storage.from("resource-photos").getPublicUrl(path);

  const prev =
    approval.payload_json && typeof approval.payload_json === "object" && !Array.isArray(approval.payload_json)
      ? { ...(approval.payload_json as Record<string, unknown>) }
      : {};
  const payload_json = {
    ...prev,
    signed_performa_pdf_url: publicUrl,
    performa_requester_message: message,
    performa_submitted_at: new Date().toISOString(),
  };

  const { error: updErr } = await dataClient
    .from("approvals")
    .update({ status: "Performa_Submitted", payload_json })
    .eq("id", id);
  if (updErr) return NextResponse.json({ message: updErr.message }, { status: 400 });

  const { data: supers } = await dataClient
    .from("users_profile")
    .select("id")
    .eq("status", "ACTIVE")
    .eq("is_super_user", true);
  const rows = (supers ?? []).map((u) => ({
    recipient_user_id: u.id,
    title: "Leave performa submitted",
    body: "A requester uploaded a signed leave performa. Final approval is required.",
    category: "leave_request",
    link: `/approvals/${id}`,
    meta: { approval_id: id, stage: "super_after_performa" },
  }));
  if (rows.length) await dataClient.from("notifications").insert(rows);

  return NextResponse.json({ ok: true });
}
