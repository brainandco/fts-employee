import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

/** Latest notifications for the signed-in user (dropdown / previews). */
export async function GET(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, raw)) : DEFAULT_LIMIT;

  const supabase = await getDataClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, is_read, created_at, link")
    .eq("recipient_user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ notifications: data ?? [] });
}
