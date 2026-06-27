import { NextResponse } from "next/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { getDataClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrlAndAnonKey } from "@/lib/supabase/public-env";
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

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

function mimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeMime(type: string, fileName: string, buf?: Buffer): string | null {
  let mime = type.trim().toLowerCase();
  if (mime === "image/jpg" || mime === "image/pjpeg") mime = "image/jpeg";
  if (mime === "image/x-png") mime = "image/png";
  if (!mime || mime === "application/octet-stream" || mime === "image") {
    mime = mimeFromFileName(fileName) ?? "";
  }
  if (!mime && buf) {
    mime = mimeFromBuffer(buf) ?? "";
  }
  return ALLOWED.has(mime) ? mime : null;
}

async function readUploadedImage(
  entry: FormDataEntryValue | null
): Promise<{ buf: Buffer; mime: string } | { error: string; status: number }> {
  if (!entry || typeof entry === "string") {
    return { error: "Please choose a photo to upload.", status: 400 };
  }

  const blob = entry as Blob;
  if (!blob.size) {
    return { error: "Please choose a photo to upload.", status: 400 };
  }
  if (blob.size > MAX_BYTES) {
    return { error: "Photo must be 5 MB or smaller.", status: 400 };
  }

  const fileName = entry instanceof File ? entry.name : "avatar.jpg";
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = normalizeMime(entry instanceof File ? entry.type : blob.type, fileName, buf);
  if (!mime) {
    return { error: "Could not upload this photo. Try another image.", status: 400 };
  }

  return { buf, mime };
}

async function portalMode(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth?.user?.email) return null;

  const email = auth.user.email.trim().toLowerCase();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const client = admin ?? (await getDataClient());

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
    session: auth.session,
    isEmployee,
    isAdminView,
    employeeId: employee?.id ?? null,
    dataClient: await getDataClient(),
  };
}

function storageClient(token: string) {
  const env = getSupabaseUrlAndAnonKey();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  const mode = await portalMode(request);
  if (!mode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const parsed = await readUploadedImage(form.get("file"));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { buf, mime } = parsed;

  const ext = extFromMime(mime);
  const uid = mode.session.user.id;
  const path = avatarObjectPath(uid, ext);

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const supabase = admin ?? storageClient(mode.session.access_token);
  if (!supabase) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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

export async function DELETE(req: Request) {
  const mode = await portalMode(req);
  if (!mode) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uid = mode.session.user.id;
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServerSupabaseAdmin() : null;
  const supabase = admin ?? storageClient(mode.session.access_token);
  if (!supabase) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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
