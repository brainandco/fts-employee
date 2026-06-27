import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { mapTaskRow } from "@/lib/mobile/tasks";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

type Params = { params: Promise<{ id: string }> };

async function displayNameForUser(
  supabase: Awaited<ReturnType<typeof getDataClient>>,
  userId: string,
  currentUserId: string
): Promise<string> {
  if (userId === currentUserId) return "You";

  const { data: profile } = await supabase
    .from("users_profile")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const fromProfile = profile?.full_name?.trim() || profile?.email?.trim();
  if (fromProfile) return fromProfile;

  if (profile?.email) {
    const { data: emp } = await supabase
      .from("employees")
      .select("full_name")
      .eq("email", profile.email.trim().toLowerCase())
      .maybeSingle();
    if (emp?.full_name?.trim()) return emp.full_name.trim();
  }

  return "Team";
}

/** GET — task detail + comments for mobile. */
export async function GET(req: Request, { params }: Params) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Tasks are available for employee accounts only." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await getDataClient();

  const { data: row } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, created_at, closed_at")
    .eq("id", id)
    .eq("assigned_to_user_id", auth.user.id)
    .maybeSingle();

  if (!row) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const { data: commentRows } = await supabase
    .from("task_comments")
    .select("id, body, created_at, user_id")
    .eq("task_id", id)
    .order("created_at", { ascending: true });

  const comments = await Promise.all(
    (commentRows ?? []).map(async (c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      authorName: await displayNameForUser(supabase, c.user_id, auth.user.id),
      isMine: c.user_id === auth.user.id,
    }))
  );

  return NextResponse.json({
    task: mapTaskRow(row),
    comments,
  });
}
