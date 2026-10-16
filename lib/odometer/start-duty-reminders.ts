import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmployeePortalBaseUrl } from "@/lib/employee-portal-base-url";
import { dispatchNotifications } from "@/lib/notifications/dispatch-notifications";
import { resolveEmployeeRecipientUserId } from "@/lib/odometer/duty-reminders";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

const TZ = "Asia/Riyadh";

export type StartDutyWindowKind = "morning" | "night";

export type StartDutyReminderRunResult = {
  window: string | null;
  eligible: number;
  sent: number;
  skipped: number;
  errors: string[];
};

type RiyadhParts = {
  date: string;
  hour: number;
  minute: number;
};

function getRiyadhParts(now: Date): RiyadhParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    hour: parseInt(pick("hour"), 10) || 0,
    minute: parseInt(pick("minute"), 10) || 0,
  };
}

function previousIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((n) => parseInt(n, 10));
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

/** Instant for YYYY-MM-DD HH:mm in Asia/Riyadh (as UTC Date). */
function riyadhWallToUtc(isoDate: string, hour: number, minute: number): Date {
  const approx = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);
  return approx;
}

/**
 * Active nudge windows (Riyadh):
 * - Morning: 05:30–09:00 → window_key morning:YYYY-MM-DD
 * - Night: 19:30–23:59 same evening, and 00:00–02:00 next calendar day → night:YYYY-MM-DD (evening date)
 */
export function getActiveStartDutyWindow(
  now: Date = new Date()
): { kind: StartDutyWindowKind; windowKey: string; periodStartUtc: Date } | null {
  const { date, hour, minute } = getRiyadhParts(now);
  const mins = hour * 60 + minute;

  if (mins >= 5 * 60 + 30 && mins <= 9 * 60) {
    return {
      kind: "morning",
      windowKey: `morning:${date}`,
      periodStartUtc: riyadhWallToUtc(date, 5, 0),
    };
  }

  if (mins >= 19 * 60 + 30) {
    return {
      kind: "night",
      windowKey: `night:${date}`,
      periodStartUtc: riyadhWallToUtc(date, 19, 0),
    };
  }

  if (mins <= 2 * 60) {
    const eveningDate = previousIsoDate(date);
    return {
      kind: "night",
      windowKey: `night:${eveningDate}`,
      periodStartUtc: riyadhWallToUtc(eveningDate, 19, 0),
    };
  }

  return null;
}

function driverDutyLink(): string {
  return `${getEmployeePortalBaseUrl()}/dashboard?vehicle_duty=1`;
}

async function claimWindow(
  admin: SupabaseClient,
  employeeId: string,
  windowKey: string,
  sentAtIso: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("start_duty_reminder_log")
    .insert({ employee_id: employeeId, window_key: windowKey, sent_at: sentAtIso })
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation → already sent for this window
    if (error.code === "23505") return false;
    throw error;
  }
  return Boolean(data?.id);
}

async function loadEligibleDriverIds(admin: SupabaseClient): Promise<string[]> {
  const { data: roleRows, error: roleErr } = await admin
    .from("employee_roles")
    .select("employee_id")
    .eq("role", "Driver/Rigger");
  if (roleErr) throw roleErr;

  const roleIds = [...new Set((roleRows ?? []).map((r) => r.employee_id as string).filter(Boolean))];
  if (!roleIds.length) return [];

  const { data: assigned, error: assignErr } = await admin
    .from("vehicle_assignments")
    .select("employee_id")
    .in("employee_id", roleIds);
  if (assignErr) throw assignErr;

  const withVehicle = [...new Set((assigned ?? []).map((r) => r.employee_id as string).filter(Boolean))];
  if (!withVehicle.length) return [];

  const { data: activeEmps, error: empErr } = await admin
    .from("employees")
    .select("id")
    .in("id", withVehicle)
    .eq("status", "ACTIVE");
  if (empErr) throw empErr;

  return (activeEmps ?? []).map((e) => e.id as string);
}

/**
 * Drivers who already started duty for this morning/night period (open or closed)
 * should not get a "please start" nudge.
 */
async function loadEmployeesWhoStartedSince(
  admin: SupabaseClient,
  employeeIds: string[],
  periodStartUtc: Date
): Promise<Set<string>> {
  if (!employeeIds.length) return new Set();
  const { data, error } = await admin
    .from("vehicle_duty_shifts")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .gte("started_at", periodStartUtc.toISOString());
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.employee_id as string));
}

async function loadEmployeesWithOpenDuty(
  admin: SupabaseClient,
  employeeIds: string[]
): Promise<Set<string>> {
  if (!employeeIds.length) return new Set();
  const { data, error } = await admin
    .from("vehicle_duty_shifts")
    .select("employee_id")
    .in("employee_id", employeeIds)
    .eq("status", "open");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.employee_id as string));
}

/**
 * Remind Driver/Riggers with an assigned vehicle who have not started duty
 * during the active morning/night nudge window.
 * Does not change start/end odometer or open-duty 4/8/12h reminders.
 */
export async function runStartDutyReminders(now: Date = new Date()): Promise<StartDutyReminderRunResult> {
  const admin = createServerSupabaseAdmin();
  const result: StartDutyReminderRunResult = {
    window: null,
    eligible: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const active = getActiveStartDutyWindow(now);
  if (!active) {
    return result;
  }

  result.window = active.windowKey;
  const nowIso = now.toISOString();

  let eligibleIds: string[];
  try {
    eligibleIds = await loadEligibleDriverIds(admin);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  let openSet: Set<string>;
  let startedSet: Set<string>;
  try {
    openSet = await loadEmployeesWithOpenDuty(admin, eligibleIds);
    startedSet = await loadEmployeesWhoStartedSince(admin, eligibleIds, active.periodStartUtc);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  const targets = eligibleIds.filter((id) => !openSet.has(id) && !startedSet.has(id));
  result.eligible = targets.length;

  const shiftLabel = active.kind === "morning" ? "morning" : "night";
  const title = "Start duty reminder";
  const body =
    `You haven't started your ${shiftLabel} duty. If you are working, please start your duty now in the app.`;

  for (const employeeId of targets) {
    try {
      const claimed = await claimWindow(admin, employeeId, active.windowKey, nowIso);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }

      const { userId } = await resolveEmployeeRecipientUserId(admin, employeeId);
      if (!userId) {
        result.errors.push(`employee ${employeeId}: no portal user`);
        result.skipped += 1;
        continue;
      }

      await dispatchNotifications(admin, [
        {
          recipient_user_id: userId,
          title,
          body,
          category: "vehicle_duty_start_reminder",
          link: driverDutyLink(),
          meta: {
            employeeId,
            windowKey: active.windowKey,
            kind: active.kind,
          },
        },
      ]);
      result.sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`employee ${employeeId}: ${msg}`);
      console.error("[start-duty-reminders]", employeeId, e);
    }
  }

  return result;
}
