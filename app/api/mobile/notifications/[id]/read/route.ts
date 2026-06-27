import { NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** PATCH — mark notification read for mobile (Bearer token). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  const supabase = await getDataClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: now })
    .eq("id", id)
    .eq("recipient_user_id", auth.user.id);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
