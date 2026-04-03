import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { getDataClient } from "@/lib/supabase/server";
import { BUCKET, avatarObjectPath, publicAvatarUrl } from "@/lib/profile/avatar-storage";
import type { NextRequest } from "next/server";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

async function portalMode() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.email) return null;

  const email = session.user.email.trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const client = admin ?? supabase;

  const { data: employee } = await client
    .from("employees")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();
  const { data: userProfile } = await client
    .from("users_profile")
    .select("id, status")
    .eq("email", email)
    .maybeSingle();

  const isEmployee = !!employee && employee.status === "ACTIVE";
  const isAdminView = !!userProfile && userProfile.status === "ACTIVE" && !employee;
  if (!isEmployee && !isAdminView) return null;

  return {
    session,
    isEmployee,
    isAdminView,
    employeeId: employee?.id ?? null,
    dataClient: await getDataClient(),
  };
}

export async function POST(request: NextRequest) {
  const mode = await portalMode();
  if (!mode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
  }

  const ext = extFromMime(mime);
  const uid = mode.session.user.id;
  const path = avatarObjectPath(uid, ext);
  const buf = Buffer.from(await file.arrayBuffer());

  const supabase = await createServerSupabaseClient();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mime, upsert: true });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  const url = publicAvatarUrl(uid, ext);
  if (!url) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const client = mode.dataClient;
  if (mode.isAdminView) {
    const { error } = await client.from("users_profile").update({ avatar_url: url }).eq("id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (mode.isEmployee && mode.employeeId) {
    const { error } = await client.from("employees").update({ avatar_url: url }).eq("id", mode.employeeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, avatar_url: url });
}

export async function DELETE() {
  const mode = await portalMode();
  if (!mode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = mode.session.user.id;
  const supabase = await createServerSupabaseClient();
  const { data: list } = await supabase.storage.from(BUCKET).list(uid);
  const names = (list ?? []).map((o) => o.name).filter(Boolean);
  if (names.length) {
    await supabase.storage.from(BUCKET).remove(names.map((n) => `${uid}/${n}`));
  }

  const client = mode.dataClient;
  if (mode.isAdminView) {
    const { error } = await client.from("users_profile").update({ avatar_url: null }).eq("id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (mode.isEmployee && mode.employeeId) {
    const { error } = await client.from("employees").update({ avatar_url: null }).eq("id", mode.employeeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
