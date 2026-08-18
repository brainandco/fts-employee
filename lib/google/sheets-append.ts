import { getGoogleAccessToken, isGoogleSaConfigured } from "@/lib/google/service-account";
import type { DailyOdoSummary } from "@/lib/odometer/daily-summary";
import { dashKm } from "@/lib/odometer/daily-summary";

export const ODOMETER_SHEET_HEADER = [
  "Date",
  "Driver",
  "Employee ID",
  "Region",
  "Team",
  "Plate",
  "Vehicle",
  "Start KM",
  "Start timestamp",
  "End KM",
  "End timestamp",
  "Shift KM (end − start)",
  "Previous date",
  "Previous shift total KM",
  "vs previous shift KM",
  "Shift total KM",
  "Start location",
  "End location",
  "Start plate photo",
  "Start odometer photos",
  "End plate photo",
  "End odometer photos",
  "Status",
];

function todayTab(): string {
  return process.env.GOOGLE_SHEETS_ODOMETER_TODAY_TAB?.trim() || "Today";
}

function historyTab(): string {
  return process.env.GOOGLE_SHEETS_ODOMETER_HISTORY_TAB?.trim() || "History";
}

function colLetter(n: number): string {
  // 1-based: 1=A ... 23=W
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

const LAST_COL = colLetter(ODOMETER_SHEET_HEADER.length);

export function summaryToSheetRow(row: DailyOdoSummary): string[] {
  return [
    row.reading_date,
    row.driver,
    row.employee_id,
    row.region,
    row.team,
    row.plate,
    row.vehicleLabel,
    dashKm(row.morningKm),
    row.morningAt || "",
    dashKm(row.eveningKm),
    row.eveningAt || "",
    dashKm(row.todayKm),
    row.previousDate || "",
    dashKm(row.previousTotalKm),
    dashKm(row.vsPreviousKm),
    dashKm(row.dayTotalKm),
    row.morningGps,
    row.eveningGps,
    row.morningPlatePhoto,
    row.morningOdoPhotos,
    row.eveningPlatePhoto,
    row.eveningOdoPhotos,
    row.status,
  ];
}

/**
 * History tab keeps every day (upsert by date + plate).
 * Today tab is rewritten to only the current reading date (clears previous calendar day).
 */
export async function syncOdometerDailySheets(input: {
  readingDate: string;
  todaySummaries: DailyOdoSummary[];
  historySummary: DailyOdoSummary;
}): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEETS_ODOMETER_ID?.trim();
  if (!sheetId) {
    console.warn("[odometer-sheets] GOOGLE_SHEETS_ODOMETER_ID not set — skipping");
    return;
  }
  if (!isGoogleSaConfigured()) {
    console.warn("[odometer-sheets] Google SA not configured — skipping");
    return;
  }

  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
  await ensureTabs(token, sheetId);

  await rewriteTab(token, sheetId, todayTab(), input.todaySummaries.filter((s) => s.reading_date === input.readingDate));
  await upsertHistoryRow(token, sheetId, input.historySummary);
}

async function sheetsFetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Google Sheets ${res.status}: ${err.slice(0, 400)}`);
  }
  return res.json().catch(() => ({}));
}

async function ensureTabs(token: string, sheetId: string): Promise<void> {
  const data = (await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?fields=sheets.properties.title`
  )) as { sheets?: Array<{ properties?: { title?: string } }> };
  const titles = new Set((data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[]);
  const missing = [todayTab(), historyTab()].filter((t) => !titles.has(t));
  if (missing.length === 0) return;
  await sheetsFetch(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

async function rewriteTab(token: string, sheetId: string, tab: string, rows: DailyOdoSummary[]): Promise<void> {
  const range = `${tab}!A:${LAST_COL}`;
  await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", body: "{}" }
  );
  const values = [ODOMETER_SHEET_HEADER, ...rows.map(summaryToSheetRow)];
  await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
}

async function upsertHistoryRow(token: string, sheetId: string, row: DailyOdoSummary): Promise<void> {
  const tab = historyTab();
  const getRange = `${tab}!A:${LAST_COL}`;
  const data = (await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(getRange)}`
  )) as { values?: string[][] };
  const values = data.values ?? [];
  if (values.length === 0 || !values[0]?.[0]) {
    await sheetsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [ODOMETER_SHEET_HEADER, summaryToSheetRow(row)] }) }
    );
    return;
  }

  const sheetRowIndex = values.findIndex((r, i) => i > 0 && r[0] === row.reading_date && r[5] === row.plate);
  const line = summaryToSheetRow(row);
  if (sheetRowIndex >= 1) {
    const a1 = `${tab}!A${sheetRowIndex + 1}`;
    await sheetsFetch(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(a1)}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [line] }) }
    );
    return;
  }

  await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(`${tab}!A:${LAST_COL}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [line] }) }
  );
}
