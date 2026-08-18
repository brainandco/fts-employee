"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { joinPlateParts, splitPlateParts, todayLocalIsoDate } from "@/lib/odometer/plate-parts";

type Slot = "start" | "end";

type AnalyzeResponse = {
  ocrStatus: "ok" | "failed" | "skipped_quota";
  ocrUnitsUsed: number;
  quota: { unitsUsed: number; cap: number; yearMonth: string };
  plate: { suggested: string | null; candidates: string[]; raw: string };
  odometer: { suggestedKm: number | null; candidates: number[]; raw: string };
  vehicle: { id: string; plate_number: string | null; make: string | null; model: string | null; mileage: number | null };
};

async function uploadOdometerPhoto(vehicleId: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("purpose", "odometer-reading");
  fd.set("vehicle_id", vehicleId);
  const res = await fetch("/api/uploads/resource-photo", { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "Upload failed");
  if (typeof data.url !== "string") throw new Error("Upload did not return a URL");
  return data.url;
}

export function OdometerSubmitButton({
  vehicleId,
  plateLabel,
  dutyOpen = false,
  dutyStartedAt = null,
}: {
  vehicleId: string;
  plateLabel: string;
  dutyOpen?: boolean;
  dutyStartedAt?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const slot: Slot = dutyOpen ? "end" : "start";
  const [plateUrl, setPlateUrl] = useState<string | null>(null);
  const [odoUrls, setOdoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [plateLetters, setPlateLetters] = useState("");
  const [plateDigits, setPlateDigits] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [capturedAt, setCapturedAt] = useState<string>(new Date().toISOString());

  const canAnalyze = Boolean(plateUrl && odoUrls.length > 0);
  const quotaHint = useMemo(() => {
    if (!analysis) return null;
    return `OCR this month: ${analysis.quota.unitsUsed} / ${analysis.quota.cap} (cap ≈ $13)`;
  }, [analysis]);

  function reset() {
    setPlateUrl(null);
    setOdoUrls([]);
    setAnalysis(null);
    setPlateLetters("");
    setPlateDigits("");
    setKmFinal("");
    setError("");
    setMessage("");
    setLat(null);
    setLng(null);
    setAccuracyM(null);
    setLocationLabel("");
    setCapturedAt(new Date().toISOString());
  }

  function readGps() {
    if (!navigator.geolocation) {
      setError("Location is not available on this device. Enable GPS or continue without it on desktop.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        setAccuracyM(pos.coords.accuracy);
        setCapturedAt(new Date().toISOString());
        setError("");
        void fetch(`/api/vehicles/odometer/geocode?lat=${encodeURIComponent(String(nextLat))}&lng=${encodeURIComponent(String(nextLng))}`)
          .then((r) => r.json())
          .then((d: { label?: string | null }) => {
            if (typeof d.label === "string" && d.label.trim()) setLocationLabel(d.label.trim());
          })
          .catch(() => {});
      },
      () => {
        setError("Could not read GPS. Allow location access and try again (required for field submissions).");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function onPlateFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadOdometerPhoto(vehicleId, file);
      setPlateUrl(url);
      setCapturedAt(new Date().toISOString());
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plate upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onOdoFile(file: File | null) {
    if (!file) return;
    if (odoUrls.length >= 8) {
      setError("At most 8 odometer photos");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const url = await uploadOdometerPhoto(vehicleId, file);
      setOdoUrls((prev) => [...prev, url]);
      setCapturedAt(new Date().toISOString());
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Odometer upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAnalyze() {
    if (!canAnalyze || !plateUrl) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      readGps();
      const res = await fetch("/api/vehicles/odometer/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          plate_photo_url: plateUrl,
          odometer_photo_urls: odoUrls,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "OCR failed");
      const a = data as AnalyzeResponse;
      setAnalysis(a);
      const parts = splitPlateParts(a.plate.suggested || a.vehicle.plate_number || "");
      setPlateLetters(parts.letters);
      setPlateDigits(parts.digits);
      setKmFinal(a.odometer.suggestedKm != null ? String(a.odometer.suggestedKm) : "");
      if (a.ocrStatus === "skipped_quota") {
        setMessage("Monthly OCR budget reached (~$13). Enter plate and km manually — photos are still saved.");
      } else if (a.ocrStatus === "failed") {
        setMessage("OCR failed. Enter plate and km manually from the photos.");
      } else {
        setMessage("Review OCR suggestions, edit if needed, then confirm.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!plateUrl || odoUrls.length < 1) {
      setError("Capture plate and at least one odometer photo");
      return;
    }
    const km = Number(kmFinal);
    const plateFinal = joinPlateParts(plateLetters, plateDigits);
    if (!plateFinal) {
      setError("Enter number plate letters and digits");
      return;
    }
    if (!Number.isFinite(km) || km < 0) {
      setError("Enter a valid odometer km reading");
      return;
    }
    if (lat == null || lng == null) {
      setError("GPS required — allow location and tap Refresh GPS");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/vehicles/odometer/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          slot,
          reading_date: todayLocalIsoDate(),
          captured_at: capturedAt,
          lat,
          lng,
          accuracy_m: accuracyM,
          plate_photo_url: plateUrl,
          odometer_photo_urls: odoUrls,
          plate_number_final: plateFinal.trim(),
          odometer_km_final: Math.round(km),
          ocr_plate_raw: analysis?.plate.raw ?? null,
          ocr_odometer_raw: analysis?.odometer.raw ?? null,
          ocr_status: analysis?.ocrStatus ?? "failed",
          ocr_units_used: analysis?.ocrUnitsUsed ?? 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.message === "string" ? data.message : "Submit failed");
      setMessage(slot === "start" ? "Duty started." : "Duty ended.");
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {dutyOpen ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            On duty{dutyStartedAt ? ` since ${new Date(dutyStartedAt).toLocaleString()}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Duty not started</span>
        )}
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(true);
            readGps();
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            dutyOpen
              ? "border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100"
              : "border border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
          }`}
        >
          {dutyOpen ? "End duty" : "Start duty"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-sky-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-zinc-900">
          {slot === "start" ? "Start duty" : "End duty"} — {plateLabel}
        </p>
        <button type="button" className="text-xs text-zinc-500 hover:text-zinc-800" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        {slot === "start"
          ? "Duty starts only after plate + odometer photos, GPS, and km are saved."
          : "Duty ends only after plate + odometer photos, GPS, and km are saved."}{" "}
        Live camera only (no gallery).
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-800">1. Number plate photo</p>
          {plateUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plateUrl} alt="" className="mt-2 h-24 w-full rounded object-cover" />
          ) : null}
          <label className="mt-2 inline-block text-xs">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={busy}
              className="text-xs"
              onChange={(e) => {
                void onPlateFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3">
          <p className="text-xs font-medium text-zinc-800">2. Odometer photo(s)</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {odoUrls.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" className="h-14 w-14 rounded object-cover" />
            ))}
          </div>
          <label className="mt-2 inline-block text-xs">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={busy}
              className="text-xs"
              onChange={(e) => {
                void onOdoFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2 text-xs text-zinc-600">
        <button type="button" onClick={readGps} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          Refresh GPS
        </button>
        <span className="min-w-0 flex-1 break-words">
          {lat != null && lng != null
            ? `${locationLabel ? `${locationLabel} · ` : ""}GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}${accuracyM != null ? ` (±${Math.round(accuracyM)}m)` : ""}`
            : "GPS not set"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !canAnalyze}
          onClick={() => void onAnalyze()}
          className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Scan with OCR"}
        </button>
        <button
          type="button"
          disabled={busy || !plateUrl || odoUrls.length < 1}
          onClick={() => void onConfirm()}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          Confirm & {slot === "start" ? "start duty" : "end duty"}
        </button>
      </div>

      {analysis ? (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <PlateKmInputs
            letters={plateLetters}
            digits={plateDigits}
            km={kmFinal}
            onLetters={setPlateLetters}
            onDigits={setPlateDigits}
            onKm={setKmFinal}
          />
          {quotaHint ? <p className="text-xs text-zinc-500">{quotaHint}</p> : null}
          {analysis.plate.raw || analysis.odometer.raw ? (
            <p className="text-[11px] leading-snug text-zinc-500">
              Vision plate: {analysis.plate.raw.replace(/\s+/g, " ").slice(0, 160) || "—"}
              <br />
              Vision odometer: {analysis.odometer.raw.replace(/\s+/g, " ").slice(0, 160) || "—"}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-800">Scan photos first (or enter values after scan / quota skip).</p>
      )}

      {!analysis && canAnalyze ? (
        <div className="mt-2 rounded-lg border border-zinc-200 p-3">
          <PlateKmInputs
            letters={plateLetters}
            digits={plateDigits}
            km={kmFinal}
            onLetters={setPlateLetters}
            onDigits={setPlateDigits}
            onKm={setKmFinal}
          />
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function PlateKmInputs({
  letters,
  digits,
  km,
  onLetters,
  onDigits,
  onKm,
}: {
  letters: string;
  digits: string;
  km: string;
  onLetters: (v: string) => void;
  onDigits: (v: string) => void;
  onKm: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-zinc-800">Number plate</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="font-medium text-zinc-700">Letters</span>
          <span className="ml-1 text-zinc-400">(e.g. TSR)</span>
          <input
            value={letters}
            onChange={(e) => onLetters(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            autoCapitalize="characters"
            placeholder="TSR"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono tracking-widest"
          />
        </label>
        <label className="text-xs">
          <span className="font-medium text-zinc-700">Digits</span>
          <span className="ml-1 text-zinc-400">(e.g. 2345)</span>
          <input
            value={digits}
            inputMode="numeric"
            onChange={(e) => onDigits(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="2345"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono tracking-widest"
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="font-medium text-zinc-800">Odometer</span>
        <span className="ml-1 text-zinc-500">(kilometers)</span>
        <input
          inputMode="numeric"
          value={km}
          onChange={(e) => onKm(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g. 50500"
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono"
        />
      </label>
    </div>
  );
}

