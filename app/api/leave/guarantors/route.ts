import { NextResponse } from "next/server";

/** Guarantors were removed from leave. Route kept for compatibility with tooling that expects this path. */
export async function GET() {
  return NextResponse.json({
    mode: "none",
    requires_guarantor: false,
    guarantor_id_kind: "employee" as const,
    employees: [],
  });
}
