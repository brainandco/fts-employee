import { NextResponse } from "next/server";
import { resolveLoginEmailFromIdentifier } from "@/lib/auth/resolve-driver-login-email";

/** Public: map Iqama (Driver/Rigger only) or email to the Auth email for sign-in. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const identifier =
    typeof body.identifier === "string"
      ? body.identifier
      : typeof body.email === "string"
        ? body.email
        : "";
  const resolved = await resolveLoginEmailFromIdentifier(identifier);
  if (!resolved.ok) {
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
  return NextResponse.json({ email: resolved.email });
}
