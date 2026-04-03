import { NextResponse } from "next/server";

/** QC assignment is discontinued; PM handles assignment. */
export async function POST() {
  return NextResponse.json(
    { message: "Assignment can only be done by Project Manager." },
    { status: 403 }
  );
}
