import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** POST — assignee confirms physical receipt of an asset, SIM, or vehicle. Body: { message?: string } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session?.user?.email) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const messageRaw = body.message;
  const message = typeof messageRaw === "string" ? messageRaw.trim().slice(0, 2000) || null : null;

  const supabase = await getDataClient();
  const email = session.user.email.trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data: row } = await supabase
    .from("resource_receipt_confirmations")
    .select("id, status")
    .eq("id", id)
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (!row || row.status !== "pending") {
    return NextResponse.json({ message: "Nothing to confirm or already confirmed." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("resource_receipt_confirmations")
    .update({
      status: "confirmed",
      confirmation_message: message,
      confirmed_at: now,
    })
    .eq("id", id)
    .eq("employee_id", employee.id)
    .eq("status", "pending");

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
