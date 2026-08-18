export type OdometerSlot = "morning" | "evening";

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
  plate_number_final: string;
  odometer_km_final: number;
  plate_photo_url: string;
  odometer_photo_urls: unknown;
  ocr_status: string;
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
  morningPlatePhoto: string;
  morningOdoPhotos: string;
  eveningKm: number | null;
  eveningAt: string | null;
  eveningGps: string;
  eveningPlatePhoto: string;
  eveningOdoPhotos: string;
  /** evening − morning (same calendar day). Null until both slots exist. */
  todayKm: number | null;
  /** End-of-day total: evening, else morning. */
  dayTotalKm: number | null;
  previousDate: string | null;
  previousTotalKm: number | null;
  /** this day total − previous logged day total. */
  vsPreviousKm: number | null;
  status: "Complete" | "Morning only" | "Evening only";
};

function gps(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "";
  return `${lat}, ${lng}`;
}

export function photoList(value: unknown): string {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string" && x.length > 0).join(" | ");
  if (typeof value === "string") return value;
  return "";
}

function pickSlot(rows: OdometerReadingRow[], slot: OdometerSlot): OdometerReadingRow | undefined {
  return rows.find((r) => r.slot === slot);
}

/**
 * One row per vehicle per date: same-day km + vs previous logged day.
 */
export function buildDailySummaries(
  readings: OdometerReadingRow[],
  people: Map<string, DailyOdoPerson>,
  vehicles: Map<string, DailyOdoVehicle>
): DailyOdoSummary[] {
  const groups = new Map<string, OdometerReadingRow[]>();
  for (const row of readings) {
    const key = `${row.vehicle_id}|${row.reading_date}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const byVehicle = new Map<string, string[]>();
  for (const key of groups.keys()) {
    const [vehicleId, date] = key.split("|");
    const dates = byVehicle.get(vehicleId) ?? [];
    dates.push(date);
    byVehicle.set(vehicleId, dates);
  }
  for (const dates of byVehicle.values()) dates.sort();

  const summaries: DailyOdoSummary[] = [];
  for (const [key, rows] of groups) {
    const [vehicleId, date] = key.split("|");
    const morning = pickSlot(rows, "morning");
    const evening = pickSlot(rows, "evening");
    const primary = evening ?? morning;
    if (!primary) continue;

    const dates = byVehicle.get(vehicleId) ?? [];
    const idx = dates.indexOf(date);
    const previousDate = idx > 0 ? dates[idx - 1]! : null;
    const prevRows = previousDate ? groups.get(`${vehicleId}|${previousDate}`) ?? [] : [];
    const prevEvening = pickSlot(prevRows, "evening");
    const prevMorning = pickSlot(prevRows, "morning");
    const previousTotalKm = prevEvening?.odometer_km_final ?? prevMorning?.odometer_km_final ?? null;

    const morningKm = morning?.odometer_km_final ?? null;
    const eveningKm = evening?.odometer_km_final ?? null;
    const todayKm = morningKm != null && eveningKm != null ? eveningKm - morningKm : null;
    const dayTotalKm = eveningKm ?? morningKm;
    const vsPreviousKm = dayTotalKm != null && previousTotalKm != null ? dayTotalKm - previousTotalKm : null;

    const person = people.get(primary.employee_id);
    const vehicle = vehicles.get(vehicleId);
    const status: DailyOdoSummary["status"] =
      morning && evening ? "Complete" : morning ? "Morning only" : "Evening only";

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
      morningAt: morning?.captured_at ?? null,
      morningGps: gps(morning?.lat ?? null, morning?.lng ?? null),
      morningPlatePhoto: morning?.plate_photo_url ?? "",
      morningOdoPhotos: photoList(morning?.odometer_photo_urls),
      eveningKm,
      eveningAt: evening?.captured_at ?? null,
      eveningGps: gps(evening?.lat ?? null, evening?.lng ?? null),
      eveningPlatePhoto: evening?.plate_photo_url ?? "",
      eveningOdoPhotos: photoList(evening?.odometer_photo_urls),
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
