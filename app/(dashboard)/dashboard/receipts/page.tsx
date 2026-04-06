import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PendingReceiptRow, type PendingReceiptDisplay } from "@/components/receipts/PendingReceiptRow";

export default async function ReceiptsPage() {
  const userClient = await createServerSupabaseClient();
  const { data: { session } } = await userClient.auth.getSession();
  if (!session?.user?.email) redirect("/login");

  const supabase = await getDataClient();
  const email = session.user.email.trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id").eq("email", email).maybeSingle();
  if (!employee) redirect("/login");

  const { data: pending } = await supabase
    .from("resource_receipt_confirmations")
    .select("id, resource_type, resource_id, assigned_at, status")
    .eq("employee_id", employee.id)
    .eq("status", "pending")
    .order("assigned_at", { ascending: false });

  const rows = pending ?? [];
  const assetIds = rows.filter((r) => r.resource_type === "asset").map((r) => r.resource_id);
  const simIds = rows.filter((r) => r.resource_type === "sim_card").map((r) => r.resource_id);
  const vehicleIds = rows.filter((r) => r.resource_type === "vehicle").map((r) => r.resource_id);

  const [assetsRes, simsRes, vehiclesRes] = await Promise.all([
    assetIds.length
      ? supabase.from("assets").select("id, name, serial, category").in("id", assetIds)
      : { data: [] },
    simIds.length
      ? supabase.from("sim_cards").select("id, sim_number, operator").in("id", simIds)
      : { data: [] },
    vehicleIds.length
      ? supabase.from("vehicles").select("id, plate_number, make, model").in("id", vehicleIds)
      : { data: [] },
  ]);

  const assetMap = new Map((assetsRes.data ?? []).map((a) => [a.id as string, a]));
  const simMap = new Map((simsRes.data ?? []).map((s) => [s.id as string, s]));
  const vehicleMap = new Map((vehiclesRes.data ?? []).map((v) => [v.id as string, v]));

  const displayRows: PendingReceiptDisplay[] = rows.map((r) => {
    let label = r.resource_id;
    if (r.resource_type === "asset") {
      const a = assetMap.get(r.resource_id);
      label = a ? `${a.name}${a.serial ? ` · ${a.serial}` : ""}${a.category ? ` (${a.category})` : ""}` : r.resource_id;
    } else if (r.resource_type === "sim_card") {
      const s = simMap.get(r.resource_id);
      label = s ? `${s.sim_number} · ${s.operator}` : r.resource_id;
    } else {
      const v = vehicleMap.get(r.resource_id);
      label = v ? `${v.plate_number}${v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}` : r.resource_id;
    }
    return {
      id: r.id,
      resource_type: r.resource_type as PendingReceiptDisplay["resource_type"],
      label,
      assigned_at: r.assigned_at as string,
    };
  });

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900">Dashboard</Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-900">Confirm receipt</span>
      </nav>

      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Confirm receipt</h1>
        <p className="mt-2 text-sm text-zinc-700">
          When tools, SIMs, or vehicles are assigned to you, confirm here that you physically received them. For{" "}
          <strong>assets</strong>, you must upload at least two photos of each item&apos;s current condition before confirming.
          SIMs and vehicles only need your confirmation (optional note).
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-emerald-900 hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      {displayRows.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No pending confirmations. New assignments will appear here and in Notifications.
        </div>
      ) : (
        <ul className="space-y-4">
          {displayRows.map((row) => (
            <PendingReceiptRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}
