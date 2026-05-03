import { getDataClient } from "@/lib/supabase/server";
import { employeeNameFolderSlug } from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { NextResponse } from "next/server";

/** GET ?regionId= (optional, ignored) — all active employees for reporting workspace file picker. */
export async function GET(_req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  const supabase = await getDataClient();
  const { data: rows, error } = await supabase
    .from("employees")
    .select("id, full_name, email, region_id")
    .eq("status", "ACTIVE")
    .order("full_name");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({
    employees: (rows ?? []).map((e) => ({
      id: e.id,
      fullName: e.full_name ?? "—",
      email: e.email,
      regionId: (e as { region_id?: string | null }).region_id ?? null,
      folderSlug: employeeNameFolderSlug(e.full_name ?? null, e.id),
    })),
  });
}
