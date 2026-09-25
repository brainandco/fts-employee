import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLoginEmail } from "@/lib/auth/employee-lookup";
import { getEmployeePortalBaseUrl } from "@/lib/employee-portal-base-url";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import { notifyVehicleDutyAdmins } from "@/lib/notify-vehicle-duty-admins";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

const MS_PER_HOUR = 60 * 60 * 1000;
const DUTY_LIMIT_HOURS = 12;

export type DutyReminderMilestone = 4 | 8 | 12;

type OpenShiftRow = {
  id: string;
  vehicle_id: string;
  employee_id: string;
  started_at: string;
  reminder_4h_sent_at: string | null;
  reminder_8h_sent_at: string | null;
  reminder_12h_sent_at: string | null;
};

export type DutyReminderRunResult = {
  scanned: number;
  sent: { at4h: number; at8h: number; at12h: number };
  skipped: number;
  errors: string[];
};

function adminOdometerLink(): string {
  const base = (process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "").replace(/\/$/, "");
  return base ? `${base}/vehicles/odometer` : "/vehicles/odometer";
}

function driverDashboardLink(): string {
  return `${getEmployeePortalBaseUrl()}/dashboard`;
}

function remainingHoursLabel(milestone: DutyReminderMilestone): number {
  return DUTY_LIMIT_HOURS - milestone;
}

function sentColumn(milestone: DutyReminderMilestone): keyof Pick<
  OpenShiftRow,
  "reminder_4h_sent_at" | "reminder_8h_sent_at" | "reminder_12h_sent_at"
> {
  if (milestone === 4) return "reminder_4h_sent_at";
  if (milestone === 8) return "reminder_8h_sent_at";
  return "reminder_12h_sent_at";
}

/** Resolve portal auth user id for an employee (email → users_profile). */
export async function resolveEmployeeRecipientUserId(
  client: SupabaseClient,
  employeeId: string
): Promise<{ userId: string | null; employeeName: string; plateHint?: string }> {
  const { data: emp } = await client
    .from("employees")
    .select("id, email, full_name")
    .eq("id", employeeId)
    .maybeSingle();

  const employeeName = (emp?.full_name as string | null)?.trim() || "Driver";
  const email = typeof emp?.email === "string" ? emp.email.trim() : "";
  if (!email) return { userId: null, employeeName };

  const normalized = normalizeLoginEmail(email);
  const { data: byEmail } = await client
    .from("users_profile")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (byEmail?.id) return { userId: byEmail.id as string, employeeName };

  if (email !== normalized) {
    const { data: byRaw } = await client.from("users_profile").select("id").eq("email", email).maybeSingle();
    if (byRaw?.id) return { userId: byRaw.id as string, employeeName };
  }

  const { data: ilikeRows } = await client.from("users_profile").select("id, email").ilike("email", email).limit(10);
  const hit = (ilikeRows ?? []).find(
    (r) => normalizeLoginEmail(String(r.email ?? "")) === normalized
  );
  return { userId: hit?.id ? (hit.id as string) : null, employeeName };
}

async function loadPlate(client: SupabaseClient, vehicleId: string): Promise<string> {
  const { data } = await client.from("vehicles").select("plate_number").eq("id", vehicleId).maybeSingle();
  return (data?.plate_number as string | null)?.trim() || "vehicle";
}

/**
 * Claim a reminder slot with a conditional update so concurrent cron runs do not double-send.
 * Returns true if this worker owns the send.
 */
async function claimReminder(
  admin: SupabaseClient,
  shiftId: string,
  milestone: DutyReminderMilestone,
  sentAtIso: string
): Promise<boolean> {
  const col = sentColumn(milestone);
  const { data, error } = await admin
    .from("vehicle_duty_shifts")
    .update({ [col]: sentAtIso, updated_at: sentAtIso })
    .eq("id", shiftId)
    .eq("status", "open")
    .is(col, null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function notifyOnDutyUser(
  admin: SupabaseClient,
  recipientUserId: string,
  title: string,
  body: string,
  meta: Record<string, unknown>
): Promise<void> {
  await dispatchNotifications(admin, [
    {
      recipient_user_id: recipientUserId,
      title,
      body,
      category: "vehicle_duty_reminder",
      link: driverDashboardLink(),
      meta,
    },
  ]);
}

async function processMilestone(
  admin: SupabaseClient,
  shift: OpenShiftRow,
  milestone: DutyReminderMilestone,
  nowIso: string,
  result: DutyReminderRunResult
): Promise<void> {
  const col = sentColumn(milestone);
  if (shift[col]) return;

  const hoursOpen = (Date.parse(nowIso) - Date.parse(shift.started_at)) / MS_PER_HOUR;
  if (!Number.isFinite(hoursOpen) || hoursOpen < milestone) return;

  const claimed = await claimReminder(admin, shift.id, milestone, nowIso);
  if (!claimed) {
    result.skipped += 1;
    return;
  }

  const plate = await loadPlate(admin, shift.vehicle_id);
  const { userId, employeeName } = await resolveEmployeeRecipientUserId(admin, shift.employee_id);
  const remaining = remainingHoursLabel(milestone);
  const meta = {
    shiftId: shift.id,
    vehicleId: shift.vehicle_id,
    employeeId: shift.employee_id,
    milestoneHours: milestone,
  };

  try {
    if (userId) {
      if (milestone < 12) {
        await notifyOnDutyUser(
          admin,
          userId,
          "Duty reminder",
          `${remaining} hour${remaining === 1 ? "" : "s"} remaining on duty · ${plate}. Please end duty within ${DUTY_LIMIT_HOURS} hours.`,
          meta
        );
      } else {
        await notifyOnDutyUser(
          admin,
          userId,
          "Duty limit reached",
          `Your duty on ${plate} has been open for ${DUTY_LIMIT_HOURS} hours. Please end duty now.`,
          meta
        );
      }
    } else {
      result.errors.push(`shift ${shift.id}: no portal user for employee ${shift.employee_id}`);
    }

    if (milestone === 12) {
      await notifyVehicleDutyAdmins(admin, {
        title: "Duty open over 12 hours",
        body: `${employeeName} still on duty · ${plate} · open ${DUTY_LIMIT_HOURS}+ hours`,
        link: adminOdometerLink(),
        meta: { ...meta, slot: "limit" },
      });
    }

    if (milestone === 4) result.sent.at4h += 1;
    else if (milestone === 8) result.sent.at8h += 1;
    else result.sent.at12h += 1;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`shift ${shift.id} @${milestone}h: ${msg}`);
    console.error("[duty-reminders]", shift.id, milestone, e);
  }
}

/**
 * Scan open duties and send 4h / 8h / 12h reminders.
 * Does not close shifts or change start/end odometer behavior.
 */
export async function runDutyReminders(now: Date = new Date()): Promise<DutyReminderRunResult> {
  const admin = createServerSupabaseAdmin();
  const nowIso = now.toISOString();
  const result: DutyReminderRunResult = {
    scanned: 0,
    sent: { at4h: 0, at8h: 0, at12h: 0 },
    skipped: 0,
    errors: [],
  };

  const { data: openShifts, error } = await admin
    .from("vehicle_duty_shifts")
    .select(
      "id, vehicle_id, employee_id, started_at, reminder_4h_sent_at, reminder_8h_sent_at, reminder_12h_sent_at"
    )
    .eq("status", "open")
    .order("started_at", { ascending: true });

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const rows = (openShifts ?? []) as OpenShiftRow[];
  result.scanned = rows.length;

  for (const shift of rows) {
    // Process in order so a long-open shift gets all due milestones once each.
    await processMilestone(admin, shift, 4, nowIso, result);
    await processMilestone(admin, shift, 8, nowIso, result);
    await processMilestone(admin, shift, 12, nowIso, result);
  }

  return result;
}
