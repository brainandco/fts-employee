import { NextResponse } from "next/server";
import { resolveEmployeePortalAccess } from "@/lib/auth/portal-access";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** GET — pending receipt confirmations for mobile (Bearer token). */
export async function GET(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const access = await resolveEmployeePortalAccess(auth.session);
  if (access.kind !== "employee") {
    return NextResponse.json({ message: "Employee account required" }, { status: 403 });
  }

  const supabase = await getDataClient();
  const { data: pending } = await supabase
    .from("resource_receipt_confirmations")
    .select("id, resource_type, resource_id, assigned_at, status")
    .eq("employee_id", access.employeeId)
    .eq("status", "pending")
    .order("assigned_at", { ascending: false });

  const rows = pending ?? [];
  const assetIds = rows.filter((r) => r.resource_type === "asset").map((r) => r.resource_id);
  const simIds = rows.filter((r) => r.resource_type === "sim_card").map((r) => r.resource_id);
  const vehicleIds = rows.filter((r) => r.resource_type === "vehicle").map((r) => r.resource_id);

  const [assetsRes, simsRes, vehiclesRes] = await Promise.all([
    assetIds.length ? supabase.from("assets").select("id, name, serial, category").in("id", assetIds) : { data: [] },
    simIds.length ? supabase.from("sim_cards").select("id, sim_number, operator").in("id", simIds) : { data: [] },
    vehicleIds.length
      ? supabase.from("vehicles").select("id, plate_number, make, model").in("id", vehicleIds)
      : { data: [] },
  ]);

  const assetMap = new Map((assetsRes.data ?? []).map((a) => [a.id as string, a]));
  const simMap = new Map((simsRes.data ?? []).map((s) => [s.id as string, s]));
  const vehicleMap = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v]));

  const items = rows.map((r) => {
    let label = r.resource_id as string;
    if (r.resource_type === "asset") {
      const a = assetMap.get(r.resource_id as string) as { name?: string; serial?: string; category?: string } | undefined;
      if (a) {
        label = [a.name, a.serial, a.category ? `(${a.category})` : ""].filter(Boolean).join(" · ");
      }
    } else if (r.resource_type === "sim_card") {
      const s = simMap.get(r.resource_id as string) as { sim_number?: string; operator?: string } | undefined;
      if (s) label = `${s.sim_number} · ${s.operator}`;
    } else {
      const v = vehicleMap.get(r.resource_id as string) as { plate_number?: string; make?: string; model?: string } | undefined;
      if (v) label = [v.plate_number, [v.make, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    }
    return {
      id: r.id,
      resource_type: r.resource_type,
      resource_id: r.resource_id,
      label,
      assigned_at: r.assigned_at,
    };
  });

  return NextResponse.json({ items });
}
