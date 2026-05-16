import { requirePostProcessor } from "@/lib/pp/auth";
import { fetchPpReportHierarchy } from "@/lib/pp-reports/folder-hierarchy";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** GET — operators, accounts, and projects for PP final-reports folder hierarchy. */
export async function GET() {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  try {
    const supabase = await getDataClient();
    const hierarchy = await fetchPpReportHierarchy(supabase);
    return NextResponse.json(hierarchy);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load hierarchy";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
