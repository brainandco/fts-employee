import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { notifyPmAndQcInRegion } from "@/lib/notifyRegionStaff";

/**
 * Employee returns an assigned SIM to inventory (QC/PM notified).
 */
export async function POST(req: Request) {
  const userClient = await createServerSupabaseClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sim_id = typeof body.sim_id === "string" ? body.sim_id.trim() : "";
  const employee_comment = typeof body.employee_comment === "string" ? body.employee_comment.trim() : "";
  if (!sim_id) return NextResponse.json({ message: "sim_id is required" }, { status: 400 });
  if (!employee_comment) {
    return NextResponse.json({ message: "employee_comment is required." }, { status: 400 });
  }

  const supabase = await getDataClient();
  const email = (session.user.email ?? "").trim().toLowerCase();
  const { data: employee } = await supabase.from("employees").select("id, region_id, full_name").eq("email", email).maybeSingle();
  if (!employee) return NextResponse.json({ message: "Employee not found" }, { status: 403 });

  const { data: sim } = await supabase
    .from("sim_cards")
    .select("id, assigned_to_employee_id, status, sim_number")
    .eq("id", sim_id)
    .single();

  if (!sim) return NextResponse.json({ message: "SIM not found" }, { status: 404 });
  if (sim.assigned_to_employee_id !== employee.id) {
    return NextResponse.json({ message: "This SIM is not assigned to you" }, { status: 403 });
  }
  if (sim.status !== "Assigned") {
    return NextResponse.json({ message: "Only an assigned SIM can be returned this way" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error: u1 } = await supabase
    .from("sim_cards")
    .update({
      status: "Available",
      assigned_to_employee_id: null,
      assigned_by_user_id: null,
      assigned_at: null,
    })
    .eq("id", sim_id);

  if (u1) return NextResponse.json({ message: u1.message }, { status: 400 });

  const { data: histRow } = await supabase
    .from("sim_assignment_history")
    .select("id")
    .eq("sim_card_id", sim_id)
    .eq("to_employee_id", employee.id)
    .is("unassigned_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (histRow?.id) {
    await supabase.from("sim_assignment_history").update({ unassigned_at: now }).eq("id", histRow.id);
  }

  if (employee.region_id) {
    await notifyPmAndQcInRegion(supabase, employee.region_id, {
      title: "SIM returned by employee",
      body: `${employee.full_name ?? "Employee"} returned SIM ${sim.sim_number ?? sim_id}. Comment: ${employee_comment.slice(0, 240)}${employee_comment.length > 240 ? "…" : ""}`,
      category: "sim_return",
      link: "/dashboard/sims/assign",
      linkByRole: {
        pm: "/dashboard/sims/assign",
        qc: "/dashboard/region-employees-assets",
      },
      meta: { sim_id, employee_id: employee.id },
    });
  }

  return NextResponse.json({ ok: true });
}
