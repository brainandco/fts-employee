export type OdometerSlot = "start" | "end" | "morning" | "evening";

export type OdometerReadingRow = {
  vehicle_id: string;
  employee_id: string;
  team_id: string | null;
  reading_date: string;
  slot: OdometerSlot;
  captured_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m?: number | null;
  location_label?: string | null;
  plate_number_final: string;
  odometer_km_final: number;
  plate_photo_url: string;
  odometer_photo_urls: unknown;
  ocr_status: string;
  duty_shift_id?: string | null;
};

export type DailyOdoPerson = {
  full_name: string;
  region_name: string;
  team_name: string;
};

export type DailyOdoVehicle = {
  make: string;
  model: string;
};

export type DailyOdoSummary = {
  vehicle_id: string;
  employee_id: string;
  reading_date: string;
  plate: string;
  driver: string;
  region: string;
  team: string;
  vehicleLabel: string;
  morningKm: number | null;
  morningAt: string | null;
  morningGps: string;
  morningMapsUrl: string;
  morningPlatePhoto: string;
  morningOdoPhotos: string;
  eveningKm: number | null;
  eveningAt: string | null;
  eveningGps: string;
  eveningMapsUrl: string;
  eveningPlatePhoto: string;
  eveningOdoPhotos: string;
  /** end − start for this duty. Null until both exist. */
  todayKm: number | null;
  /** End-of-duty total: end, else start. */
  dayTotalKm: number | null;
  previousDate: string | null;
  previousTotalKm: number | null;
  vsPreviousKm: number | null;
  status: "Complete" | "On duty" | "Start only" | "End only";
};

function mapsUrl(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "";
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function gps(lat: number | null, lng: number | null, label?: string | null): string {
  if (lat == null || lng == null) return "";
  const coords = `${lat}, ${lng}`;
  const place = label?.trim();
  return place ? `${place} (${coords})` : coords;
}

export function photoList(value: unknown): string {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string" && x.length > 0).join(" | ");
  if (typeof value === "string") return value;
  return "";
}

function dutySide(slot: string): "start" | "end" {
  return slot === "end" || slot === "evening" ? "end" : "start";
}

function pickSide(rows: OdometerReadingRow[], side: "start" | "end"): OdometerReadingRow | undefined {
  return rows.find((r) => dutySide(r.slot) === side);
}

function groupKey(row: OdometerReadingRow): string {
  if (row.duty_shift_id) return `s:${row.duty_shift_id}`;
  return `d:${row.vehicle_id}|${row.reading_date}`;
}

/**
 * One row per duty: start + end odometer (night shifts stay on the start date).
 */
export function buildDailySummaries(
  readings: OdometerReadingRow[],
  people: Map<string, DailyOdoPerson>,
  vehicles: Map<string, DailyOdoVehicle>
): DailyOdoSummary[] {
  const groups = new Map<string, OdometerReadingRow[]>();
  for (const row of readings) {
    const key = groupKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const byVehicle = new Map<string, string[]>();
  const dateByGroup = new Map<string, string>();
  for (const [key, rows] of groups) {
    const start = pickSide(rows, "start");
    const end = pickSide(rows, "end");
    const primary = start ?? end;
    if (!primary) continue;
    const date = start?.reading_date ?? primary.reading_date;
    dateByGroup.set(key, date);
    const dates = byVehicle.get(primary.vehicle_id) ?? [];
    dates.push(`${date}|${key}`);
    byVehicle.set(primary.vehicle_id, dates);
  }
  for (const dates of byVehicle.values()) dates.sort();

  const summaries: DailyOdoSummary[] = [];
  for (const [key, rows] of groups) {
    const start = pickSide(rows, "start");
    const end = pickSide(rows, "end");
    const primary = start ?? end;
    if (!primary) continue;
    const vehicleId = primary.vehicle_id;
    const date = dateByGroup.get(key) ?? primary.reading_date;

    const stamped = byVehicle.get(vehicleId) ?? [];
    const idx = stamped.findIndex((x) => x.endsWith(`|${key}`));
    const previousToken = idx > 0 ? stamped[idx - 1]! : null;
    const previousKey = previousToken ? previousToken.slice(previousToken.indexOf("|") + 1) : null;
    const previousDate = previousToken ? previousToken.slice(0, previousToken.indexOf("|")) : null;
    const prevRows = previousKey ? groups.get(previousKey) ?? [] : [];
    const prevEnd = pickSide(prevRows, "end");
    const prevStart = pickSide(prevRows, "start");
    const previousTotalKm = prevEnd?.odometer_km_final ?? prevStart?.odometer_km_final ?? null;

    const morningKm = start?.odometer_km_final ?? null;
    const eveningKm = end?.odometer_km_final ?? null;
    const todayKm = morningKm != null && eveningKm != null ? eveningKm - morningKm : null;
    const dayTotalKm = eveningKm ?? morningKm;
    const vsPreviousKm = dayTotalKm != null && previousTotalKm != null ? dayTotalKm - previousTotalKm : null;

    const person = people.get(primary.employee_id);
    const vehicle = vehicles.get(vehicleId);
    let status: DailyOdoSummary["status"];
    if (start && end) status = "Complete";
    else if (end && !start) status = "End only";
    else {
      const started = start ? new Date(start.captured_at).getTime() : 0;
      const recent = started > 0 && Date.now() - started < 36 * 60 * 60 * 1000;
      status = recent ? "On duty" : "Start only";
    }

    summaries.push({
      vehicle_id: vehicleId,
      employee_id: primary.employee_id,
      reading_date: date,
      plate: primary.plate_number_final,
      driver: person?.full_name || "",
      region: person?.region_name || "",
      team: person?.team_name || "",
      vehicleLabel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" "),
      morningKm,
      morningAt: start?.captured_at ?? null,
      morningGps: gps(start?.lat ?? null, start?.lng ?? null, start?.location_label),
      morningMapsUrl: mapsUrl(start?.lat ?? null, start?.lng ?? null),
      morningPlatePhoto: start?.plate_photo_url ?? "",
      morningOdoPhotos: photoList(start?.odometer_photo_urls),
      eveningKm,
      eveningAt: end?.captured_at ?? null,
      eveningGps: gps(end?.lat ?? null, end?.lng ?? null, end?.location_label),
      eveningMapsUrl: mapsUrl(end?.lat ?? null, end?.lng ?? null),
      eveningPlatePhoto: end?.plate_photo_url ?? "",
      eveningOdoPhotos: photoList(end?.odometer_photo_urls),
      todayKm,
      dayTotalKm,
      previousDate,
      previousTotalKm,
      vsPreviousKm,
      status,
    });
  }

  summaries.sort((a, b) => {
    if (a.reading_date !== b.reading_date) return a.reading_date < b.reading_date ? 1 : -1;
    return a.driver.localeCompare(b.driver) || a.plate.localeCompare(b.plate);
  });
  return summaries;
}

export function dashKm(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(n);
}

export function isTodayTabSummary(row: DailyOdoSummary, todayIso: string): boolean {
  if (row.reading_date === todayIso) return true;
  if (row.status === "On duty") return true;
  if (row.eveningAt) {
    const endDate = new Date(row.eveningAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    if (endDate === todayIso) return true;
  }
  return false;
}
