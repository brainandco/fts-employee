import { createServerSupabaseAdmin } from "@/lib/supabase/admin";
import { currentYearMonthUtc, ocrMonthlyUnitCap } from "@/lib/ocr/quota-config";

export type OcrQuotaReserveResult =
  | { ok: true; yearMonth: string; unitsUsed: number; cap: number }
  | { ok: false; reason: "quota_exceeded"; yearMonth: string; unitsUsed: number; cap: number };

/**
 * Atomically reserve `units` against the monthly OCR cap.
 * Call before Vision requests; on Vision hard failure, call releaseOcrUnits.
 */
export async function reserveOcrUnits(units: number): Promise<OcrQuotaReserveResult> {
  if (units <= 0) {
    const yearMonth = currentYearMonthUtc();
    return { ok: true, yearMonth, unitsUsed: 0, cap: ocrMonthlyUnitCap() };
  }

  const admin = createServerSupabaseAdmin();
  const yearMonth = currentYearMonthUtc();
  const cap = ocrMonthlyUnitCap();

  const { data: existing } = await admin
    .from("ocr_usage_monthly")
    .select("units_used")
    .eq("year_month", yearMonth)
    .maybeSingle();

  const current = (existing?.units_used as number | undefined) ?? 0;
  if (current + units > cap) {
    return { ok: false, reason: "quota_exceeded", yearMonth, unitsUsed: current, cap };
  }

  if (!existing) {
    const { error } = await admin.from("ocr_usage_monthly").insert({
      year_month: yearMonth,
      units_used: units,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      // Race: row created by another request — retry as update
      const { data: again } = await admin
        .from("ocr_usage_monthly")
        .select("units_used")
        .eq("year_month", yearMonth)
        .maybeSingle();
      const againUsed = (again?.units_used as number | undefined) ?? 0;
      if (againUsed + units > cap) {
        return { ok: false, reason: "quota_exceeded", yearMonth, unitsUsed: againUsed, cap };
      }
      const { data: updated, error: upErr } = await admin
        .from("ocr_usage_monthly")
        .update({ units_used: againUsed + units, updated_at: new Date().toISOString() })
        .eq("year_month", yearMonth)
        .eq("units_used", againUsed)
        .select("units_used")
        .maybeSingle();
      if (upErr || !updated) {
        return { ok: false, reason: "quota_exceeded", yearMonth, unitsUsed: againUsed, cap };
      }
      return { ok: true, yearMonth, unitsUsed: updated.units_used as number, cap };
    }
    return { ok: true, yearMonth, unitsUsed: units, cap };
  }

  const { data: updated, error: upErr } = await admin
    .from("ocr_usage_monthly")
    .update({ units_used: current + units, updated_at: new Date().toISOString() })
    .eq("year_month", yearMonth)
    .eq("units_used", current)
    .select("units_used")
    .maybeSingle();

  if (upErr || !updated) {
    // Optimistic lock failed — re-check
    const { data: latest } = await admin
      .from("ocr_usage_monthly")
      .select("units_used")
      .eq("year_month", yearMonth)
      .maybeSingle();
    const latestUsed = (latest?.units_used as number | undefined) ?? current;
    if (latestUsed + units > cap) {
      return { ok: false, reason: "quota_exceeded", yearMonth, unitsUsed: latestUsed, cap };
    }
    const { data: retry, error: retryErr } = await admin
      .from("ocr_usage_monthly")
      .update({ units_used: latestUsed + units, updated_at: new Date().toISOString() })
      .eq("year_month", yearMonth)
      .eq("units_used", latestUsed)
      .select("units_used")
      .maybeSingle();
    if (retryErr || !retry) {
      return { ok: false, reason: "quota_exceeded", yearMonth, unitsUsed: latestUsed, cap };
    }
    return { ok: true, yearMonth, unitsUsed: retry.units_used as number, cap };
  }

  return { ok: true, yearMonth, unitsUsed: updated.units_used as number, cap };
}

export async function releaseOcrUnits(units: number): Promise<void> {
  if (units <= 0) return;
  const admin = createServerSupabaseAdmin();
  const yearMonth = currentYearMonthUtc();
  const { data } = await admin
    .from("ocr_usage_monthly")
    .select("units_used")
    .eq("year_month", yearMonth)
    .maybeSingle();
  const current = (data?.units_used as number | undefined) ?? 0;
  const next = Math.max(0, current - units);
  await admin
    .from("ocr_usage_monthly")
    .update({ units_used: next, updated_at: new Date().toISOString() })
    .eq("year_month", yearMonth);
}

export async function getOcrUsageThisMonth(): Promise<{ unitsUsed: number; cap: number; yearMonth: string }> {
  const admin = createServerSupabaseAdmin();
  const yearMonth = currentYearMonthUtc();
  const cap = ocrMonthlyUnitCap();
  const { data } = await admin
    .from("ocr_usage_monthly")
    .select("units_used")
    .eq("year_month", yearMonth)
    .maybeSingle();
  return { unitsUsed: (data?.units_used as number | undefined) ?? 0, cap, yearMonth };
}
