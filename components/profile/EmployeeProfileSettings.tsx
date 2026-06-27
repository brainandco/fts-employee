"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type ProfileRequestRow = {
  id: string;
  status: string;
  requested_full_name: string | null;
  requested_phone: string | null;
  requested_email: string | null;
  note_from_employee: string | null;
  created_at: string;
  resolved_at: string | null;
};

const inputReadOnlyClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 shadow-sm cursor-not-allowed";

export function EmployeeProfileSettings(props: Props) {
  const router = useRouter();
  const email = props.email;
  const [fullName, setFullName] = useState(props.mode === "admin_view" ? props.initialFullName ?? "" : "");
  const [avatarUrl, setAvatarUrl] = useState(props.initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [chkName, setChkName] = useState(false);
  const [chkPhone, setChkPhone] = useState(false);
  const [chkEmail, setChkEmail] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [myRequests, setMyRequests] = useState<ProfileRequestRow[] | null>(null);

  useEffect(() => {
    if (props.mode !== "employee") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/profile/update-request");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && Array.isArray(data.requests)) setMyRequests(data.requests);
      } catch {
        if (!cancelled) setMyRequests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.mode]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = { full_name: fullName };
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
      router.refresh();
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
      router.refresh();
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Remove failed" });
    } finally {
      setBusy(false);
    }
  }

  async function submitChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const body: {
      requested_full_name?: string;
      requested_phone?: string;
      requested_email?: string;
      note_from_employee?: string;
    } = {};
    if (chkName && reqName.trim()) body.requested_full_name = reqName.trim();
    if (chkPhone && reqPhone.trim()) body.requested_phone = reqPhone.trim();
    if (chkEmail && reqEmail.trim()) body.requested_email = reqEmail.trim().toLowerCase();
    if (reqNote.trim()) body.note_from_employee = reqNote.trim();

    if (!body.requested_full_name && !body.requested_phone && !body.requested_email) {
      setMessage({
        type: "err",
        text: "Select at least one field and enter the new name, phone, or email you want your administrator to apply.",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/profile/update-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessage({
        type: "ok",
        text: "Your request was sent to your administrator. They will update your record in the admin portal.",
      });
      setReqName("");
      setReqPhone("");
      setReqEmail("");
      setReqNote("");
      setChkName(false);
      setChkPhone(false);
      setChkEmail(false);
      const listRes = await fetch("/api/profile/update-request");
      const listData = await listRes.json().catch(() => ({}));
      if (listRes.ok && Array.isArray(listData.requests)) setMyRequests(listData.requests);
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Request failed" });
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
        credentials: "include",
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

  const displayName =
    props.mode === "employee" ? props.initialFullName.trim() || email : fullName.trim() || email;
  const isEmployee = props.mode === "employee";

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
            ? "Name, phone, and email cannot be edited here — use the request form below for those. You can update your profile photo and password on this page."
            : "Your name as shown while using the employee portal in admin view."}
        </p>
        {props.mode === "employee" ? (
          <div className="mt-4 max-w-md space-y-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-slate-700">
                Full name
              </label>
              <input id="full_name" type="text" value={props.initialFullName} readOnly disabled className={inputReadOnlyClass} />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
                Phone
              </label>
              <input id="phone" type="tel" value={props.initialPhone} readOnly disabled className={inputReadOnlyClass} />
            </div>
            <div>
              <label htmlFor="accommodations" className="block text-sm font-medium text-slate-700">
                Accommodations / notes
              </label>
              <textarea
                id="accommodations"
                value={props.initialAccommodations}
                readOnly
                disabled
                rows={3}
                className={`${inputReadOnlyClass} resize-none`}
              />
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-700">Email</span>
              <p className="mt-1 text-sm text-slate-800">{email}</p>
              <p className="mt-1 text-xs text-slate-500">Email changes require an administrator after you submit a request.</p>
            </div>
          </div>
        ) : (
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
              />
            </div>
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
        )}
      </section>

      {props.mode === "employee" ? (
        <>
          <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Request a change (name, phone, or email)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose what you want updated and enter the <span className="font-medium text-slate-800">new</span> values. Your
              administrator receives the request in the admin portal and will apply the changes to your employee record.
            </p>
            <form onSubmit={submitChangeRequest} className="mt-4 max-w-lg space-y-4">
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={chkName}
                    onChange={(e) => setChkName(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-800">New full name</span>
                    <input
                      type="text"
                      value={reqName}
                      onChange={(e) => setReqName(e.target.value)}
                      disabled={!chkName || busy}
                      placeholder="As it should appear on your record"
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                        chkName ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    />
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={chkPhone}
                    onChange={(e) => setChkPhone(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-800">New phone</span>
                    <input
                      type="tel"
                      value={reqPhone}
                      onChange={(e) => setReqPhone(e.target.value)}
                      disabled={!chkPhone || busy}
                      placeholder="New phone number"
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                        chkPhone ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    />
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={chkEmail}
                    onChange={(e) => setChkEmail(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-slate-800">New work email</span>
                    <input
                      type="email"
                      value={reqEmail}
                      onChange={(e) => setReqEmail(e.target.value)}
                      disabled={!chkEmail || busy}
                      placeholder="new.email@company.com"
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                        chkEmail ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    />
                  </span>
                </label>
              </div>
              <div>
                <label htmlFor="req_note" className="block text-sm font-medium text-slate-700">
                  Note to administrator (optional)
                </label>
                <textarea
                  id="req_note"
                  value={reqNote}
                  onChange={(e) => setReqNote(e.target.value)}
                  rows={2}
                  disabled={busy}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  placeholder="Any context that helps process your request"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send request to administrator"}
              </button>
            </form>
          </section>

          {myRequests && myRequests.length > 0 ? (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Your recent requests</h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {myRequests.map((r) => (
                  <li key={r.id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium capitalize text-slate-800">{r.status}</span>
                      <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {[r.requested_full_name && `Name → ${r.requested_full_name}`, r.requested_phone && `Phone → ${r.requested_phone}`, r.requested_email && `Email → ${r.requested_email}`]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {r.note_from_employee ? <p className="mt-1 text-slate-500">Note: {r.note_from_employee}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

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
