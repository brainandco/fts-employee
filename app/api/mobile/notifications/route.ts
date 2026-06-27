import { NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** GET — notifications list + unread count for mobile (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(raw) ? Math.min(MAX_LIMIT, Math.max(1, raw)) : DEFAULT_LIMIT;

  const supabase = await getDataClient();
  const userId = auth.user.id;

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, category, is_read, created_at, link")
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", userId)
      .eq("is_read", false),
  ]);

  if (listRes.error) return NextResponse.json({ message: listRes.error.message }, { status: 400 });

  return NextResponse.json({
    items: listRes.data ?? [],
    unreadCount: unreadRes.count ?? 0,
  });
}
