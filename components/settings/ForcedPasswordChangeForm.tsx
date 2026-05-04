"use client";

import { useState } from "react";

export function ForcedPasswordChangeForm() {
  const [current, setCurrent] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (nextPw.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (nextPw !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: nextPw }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update password.");
        return;
      }
      setDone(true);
      window.location.href = "/dashboard";
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="text-sm text-slate-600">Redirecting…</p>;
  }

  return (
    <form onSubmit={(ev) => void submit(ev)} className="max-w-md space-y-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Current password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={nextPw}
          onChange={(e) => setNextPw(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
