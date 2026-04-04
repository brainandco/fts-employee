"use client";

import { useState } from "react";
import { UserAvatar } from "./UserAvatar";

type Props =
  | {
      mode: "employee";
      initialFullName: string;
      initialPhone: string;
      initialAccommodations: string;
      email: string;
      initialAvatarUrl: string | null;
    }
  | {
      mode: "admin_view";
      initialFullName: string | null;
      email: string;
      initialAvatarUrl: string | null;
    };

export function EmployeeProfileSettings(props: Props) {
  const email = props.email;
  const [fullName, setFullName] = useState(
    props.mode === "employee" ? props.initialFullName : props.initialFullName ?? ""
  );
  const [phone, setPhone] = useState(props.mode === "employee" ? props.initialPhone : "");
  const [accommodations, setAccommodations] = useState(
    props.mode === "employee" ? props.initialAccommodations : ""
  );
  const [avatarUrl, setAvatarUrl] = useState(props.initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body =
        props.mode === "employee"
          ? { full_name: fullName, phone, accommodations }
          : { full_name: fullName };
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage({ type: "ok", text: "Profile saved." });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (typeof data.avatar_url === "string") setAvatarUrl(data.avatar_url);
      setMessage({ type: "ok", text: "Photo updated." });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Remove failed");
      setAvatarUrl(null);
      setMessage({ type: "ok", text: "Photo removed." });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Remove failed" });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setMessage({ type: "err", text: "New passwords do not match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: curPw,
          new_password: newPw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Password change failed");
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      setMessage({ type: "ok", text: "Password updated." });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Password change failed" });
    } finally {
      setBusy(false);
    }
  }

  const displayName = fullName.trim() || email;

  return (
    <div className="space-y-10">
      {message && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === "ok"
              ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
              : "bg-rose-50 text-rose-900 ring-1 ring-rose-200"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Profile photo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shown in the sidebar and header. JPEG, PNG, WebP, or GIF, up to 5 MB.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <UserAvatar name={displayName} email={email} avatarUrl={avatarUrl} size="lg" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-50">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={busy}
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = "";
                  if (f) void uploadAvatar(f);
                }}
              />
              Upload photo
            </label>
            {avatarUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeAvatar()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {props.mode === "employee" ? "Your details" : "Display name"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {props.mode === "employee"
            ? "Update how you appear and your contact details. HR identifiers are managed by administrators."
            : "Your name as shown while using the employee portal in admin view."}
        </p>
        <form onSubmit={saveProfile} className="mt-4 max-w-md space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-slate-700">
              Full name
            </label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoComplete="name"
              required={props.mode === "employee"}
            />
          </div>
          {props.mode === "employee" && (
            <>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label htmlFor="accommodations" className="block text-sm font-medium text-slate-700">
                  Accommodations / notes
                </label>
                <textarea
                  id="accommodations"
                  value={accommodations}
                  onChange={(e) => setAccommodations(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </>
          )}
          <div>
            <span className="block text-sm font-medium text-slate-700">Email</span>
            <p className="mt-1 text-sm text-slate-600">{email}</p>
            <p className="mt-1 text-xs text-slate-500">Email is managed by an administrator.</p>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            Save profile
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Password</h2>
        <p className="mt-1 text-sm text-slate-600">Use a strong password you do not reuse elsewhere.</p>
        <form onSubmit={changePassword} className="mt-4 max-w-md space-y-4">
          <div>
            <label htmlFor="cur_pw" className="block text-sm font-medium text-slate-700">
              Current password
            </label>
            <input
              id="cur_pw"
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label htmlFor="new_pw" className="block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              id="new_pw"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div>
            <label htmlFor="confirm_pw" className="block text-sm font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              id="confirm_pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
