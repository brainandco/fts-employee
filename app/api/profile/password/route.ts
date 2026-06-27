import { NextRequest, NextResponse } from "next/server";
import { changePasswordForUser } from "@/lib/auth/change-password-server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** POST — change password (web: cookie session; mobile: Bearer). */
export async function POST(request: NextRequest) {
  const auth = await getRequestAuth(request);
  if (!auth?.user?.email?.trim()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { current_password?: unknown; new_password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current_password = typeof body.current_password === "string" ? body.current_password : "";
  const new_password = typeof body.new_password === "string" ? body.new_password : "";

  if (current_password.length < 1 || new_password.length < 8) {
    return NextResponse.json(
      { error: "Current password required; new password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const result = await changePasswordForUser(
    auth.user.id,
    auth.user.email.trim(),
    current_password,
    new_password
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
