import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { mapTaskRow } from "@/lib/mobile/tasks";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — tasks assigned to the signed-in user (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Tasks are available for employee accounts only." }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: rows } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, created_at, closed_at")
    .eq("assigned_to_user_id", auth.user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const items = (rows ?? []).map(mapTaskRow);
  const openCount = items.filter((t) => t.isOpen).length;

  return NextResponse.json({ items, openCount, total: items.length });
}
