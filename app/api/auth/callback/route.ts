import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  const base = request.nextUrl.origin;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  try {
    const u = new URL(safeNext, base);
    if (u.origin !== base) return NextResponse.redirect(new URL("/dashboard", base), 302);
    return NextResponse.redirect(u, 302);
  } catch {
    return NextResponse.redirect(new URL("/dashboard", base), 302);
  }
}
