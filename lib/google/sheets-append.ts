import { getGoogleAccessToken, isGoogleSaConfigured } from "@/lib/google/service-account";

export type OdometerSheetRow = {
  date: string;
  slot: string;
  timestamp: string;
  driver: string;
  employeeId: string;
  region: string;
  team: string;
  plate: string;
  vehicle: string;
  odometerKm: number;
  lat: string;
  lng: string;
  platePhotoUrl: string;
  odometerPhotoUrls: string;
  ocrStatus: string;
};

const HEADER = [
  "Date",
  "Slot",
  "Timestamp",
  "Driver",
  "Employee ID",
  "Region",
  "Team",
  "Plate",
  "Vehicle",
  "Odometer KM",
  "Lat",
  "Lng",
  "Plate photo URL",
  "Odometer photo URLs",
  "OCR status",
];

export async function appendOdometerSheetRow(row: OdometerSheetRow): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEETS_ODOMETER_ID?.trim();
  if (!sheetId) {
    console.warn("[odometer-sheets] GOOGLE_SHEETS_ODOMETER_ID not set — skipping append");
    return;
  }
  if (!isGoogleSaConfigured()) {
    console.warn("[odometer-sheets] Google SA not configured — skipping append");
    return;
  }

  const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
  const range = process.env.GOOGLE_SHEETS_ODOMETER_RANGE?.trim() || "Sheet1!A:O";
  const values = [
    [
      row.date,
      row.slot,
      row.timestamp,
      row.driver,
      row.employeeId,
      row.region,
      row.team,
      row.plate,
      row.vehicle,
      row.odometerKm,
      row.lat,
      row.lng,
      row.platePhotoUrl,
      row.odometerPhotoUrls,
      row.ocrStatus,
    ],
  ];

  // Ensure header exists on first write (best-effort)
  await ensureHeader(token, sheetId, range);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Google Sheets append failed (${res.status}): ${err.slice(0, 300)}`);
  }
}

async function ensureHeader(token: string, sheetId: string, range: string): Promise<void> {
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range.split("!")[0] + "!A1:O1")}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!getRes.ok) return;
  const data = (await getRes.json().catch(() => ({}))) as { values?: string[][] };
  if (data.values?.[0]?.[0]) return;

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range.split("!")[0] + "!A1")}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [HEADER] }),
    }
  );
}
