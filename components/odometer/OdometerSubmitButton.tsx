"use client";

import { useMemo, useState } from "react";

type Slot = "morning" | "evening";

type AnalyzeResponse = {
  ocrStatus: "ok" | "failed" | "skipped_quota";
  ocrUnitsUsed: number;
  quota: { unitsUsed: number; cap: number; yearMonth: string };
  plate: { suggested: string | null; candidates: string[]; raw: string };
  odometer: { suggestedKm: number | null; candidates: number[]; raw: string };
  vehicle: { id: string; plate_number: string | null; make: string | null; model: string | null; mileage: number | null };
};

function todayLocalIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
}: {
  vehicleId: string;
  plateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Slot>("morning");
  const [plateUrl, setPlateUrl] = useState<string | null>(null);
  const [odoUrls, setOdoUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [plateFinal, setPlateFinal] = useState("");
  const [kmFinal, setKmFinal] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
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
    setPlateFinal("");
    setKmFinal("");
    setError("");
    setMessage("");
    setLat(null);
    setLng(null);
    setAccuracyM(null);
    setCapturedAt(new Date().toISOString());
  }

  function readGps() {
    if (!navigator.geolocation) {
      setError("Location is not available on this device. Enable GPS or continue without it on desktop.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setAccuracyM(pos.coords.accuracy);
        setCapturedAt(new Date().toISOString());
        setError("");
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
      setPlateFinal(a.plate.suggested || a.vehicle.plate_number || "");
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
    if (!plateFinal.trim()) {
      setError("Plate number is required");
      return;
    }
    if (!Number.isFinite(km) || km < 0) {
      setError("Enter a valid odometer km reading");
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
      setMessage("Odometer reading saved.");
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
          readGps();
        }}
        className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
      >
        Submit odometer
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-sky-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-zinc-900">Odometer — {plateLabel}</p>
        <button type="button" className="text-xs text-zinc-500 hover:text-zinc-800" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-600">
        Live camera only (no gallery). Capture number plate + odometer. Extra dash screens allowed.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {(["morning", "evening"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              slot === s ? "bg-sky-700 text-white" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

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

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
        <button type="button" onClick={readGps} className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50">
          Refresh GPS
        </button>
        <span>
          {lat != null && lng != null
            ? `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}${accuracyM != null ? ` (±${Math.round(accuracyM)}m)` : ""}`
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
          Confirm & save
        </button>
      </div>

      {analysis ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="font-medium text-zinc-800">Plate (confirm)</span>
            <input
              value={plateFinal}
              onChange={(e) => setPlateFinal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
          <label className="text-xs">
            <span className="font-medium text-zinc-800">Odometer km (confirm)</span>
            <input
              inputMode="numeric"
              value={kmFinal}
              onChange={(e) => setKmFinal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
          {quotaHint ? <p className="text-xs text-zinc-500 sm:col-span-2">{quotaHint}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-800">Scan photos first (or enter values after scan / quota skip).</p>
      )}

      {!analysis && canAnalyze ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            <span className="font-medium text-zinc-800">Plate (manual if needed)</span>
            <input
              value={plateFinal}
              onChange={(e) => setPlateFinal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
          <label className="text-xs">
            <span className="font-medium text-zinc-800">Odometer km</span>
            <input
              inputMode="numeric"
              value={kmFinal}
              onChange={(e) => setKmFinal(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            />
          </label>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-xs text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
