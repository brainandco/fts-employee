"use client";

import { useCallback, useEffect, useState } from "react";

type FileRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  upload_status: string;
  created_at: string;
  region_id: string;
};

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MyFilesClient({ hasRegion, hasRegionFolder }: { hasRegion: boolean; hasRegionFolder: boolean }) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/employee-files");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { message?: string }).message || "Failed to load files");
      return;
    }
    setFiles((data as { files?: FileRow[] }).files ?? []);
  }, []);

  useEffect(() => {
    if (hasRegion && hasRegionFolder) {
      setLoading(true);
      load()
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [hasRegion, hasRegionFolder, load]);

  async function upload(f: File) {
    if (!f.size) {
      setError("Empty file");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const pres = await fetch("/api/employee-files/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: f.name,
          contentType: f.type || "application/octet-stream",
          byteSize: f.size,
        }),
      });
      const pr = await pres.json();
      if (!pres.ok) throw new Error(pr.message || "Presign failed");
      const h = (pr as { id: string; uploadUrl: string; headers?: { "Content-Type"?: string } }).headers;
      const put = await fetch((pr as { uploadUrl: string }).uploadUrl, {
        method: "PUT",
        body: f,
        headers: { "Content-Type": h?.["Content-Type"] || f.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error("Upload to storage failed");
      const comp = await fetch(`/api/employee-files/${(pr as { id: string }).id}/complete`, { method: "POST" });
      const cj = await comp.json();
      if (!comp.ok) throw new Error(cj.message || "Complete failed");
      setMsg("File uploaded successfully.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    if (files.length === 0) return;
    if (
      !confirm(
        "Delete ALL your files in My files? This removes every upload from storage and cannot be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/employee-files/all", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Delete all failed");
      setMsg((data as { removed?: number }).removed ? `Removed ${(data as { removed: number }).removed} file(s).` : "All files removed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete all failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/employee-files/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError((data as { message?: string }).message || "Delete failed");
      return;
    }
    await load();
  }

  async function downloadFile(id: string) {
    const res = await fetch(`/api/employee-files/${id}/download`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { message?: string }).message || "Download failed");
      return;
    }
    const url = (data as { downloadUrl?: string }).downloadUrl;
    if (url) globalThis.open(url, "_blank", "noopener,noreferrer");
  }

  if (!hasRegion) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-900">
        Your account has no <strong>region</strong> assigned. Personal file uploads are not available until an administrator
        sets your region.
      </div>
    );
  }

  if (!hasRegionFolder) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-900">
        A storage folder for your region has not been set up yet. An administrator can enable it in the admin portal
        (Employee files → create region folder).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-800">Upload a file</label>
          <input
            type="file"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
            className="block w-full text-sm text-zinc-800 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
          <p className="mt-1 text-xs text-zinc-500">Allowed: pdf, office documents, csv, and similar. Max size is set on the server.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load().finally(() => setLoading(false));
            }}
            disabled={busy}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={deleteAll}
            disabled={busy || files.length === 0}
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-50"
          >
            Delete all my files
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">You have not uploaded any files yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-800">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-800">Size</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-800">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-800">Added</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-800">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{r.file_name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{formatBytes(r.byte_size)}</td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {r.upload_status === "active" ? "Active" : r.upload_status === "pending" ? "Pending" : "Failed"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.upload_status === "active" ? (
                      <button
                        type="button"
                        onClick={() => downloadFile(r.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        Download
                      </button>
                    ) : null}{" "}
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      disabled={busy}
                      className="text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
