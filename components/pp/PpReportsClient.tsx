"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP } from "@/lib/employee-files/storage";

type BrowseFolder = { type: "folder"; name: string; path: string };
type BrowseFile = {
  type: "file";
  name: string;
  key: string;
  size: number | null;
  lastModified: string | null;
};

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PpReportsClient({ configured }: { configured: boolean }) {
  const [browsePath, setBrowsePath] = useState("");
  const [folders, setFolders] = useState<BrowseFolder[]>([]);
  const [files, setFiles] = useState<BrowseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const loadBrowse = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const q = browsePath ? `?path=${encodeURIComponent(browsePath)}` : "";
      const res = await fetch(`/api/pp/reports/browse${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Browse failed");
      setFolders((data as { folders?: BrowseFolder[] }).folders ?? []);
      setFiles((data as { files?: BrowseFile[] }).files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Browse failed");
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [browsePath, configured]);

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  async function createProjectFolder() {
    const name = newFolderName.trim().replace(/[^\w.\-()+ @&$=!*,?:;/]/g, "_").slice(0, 120);
    if (!name) {
      setError("Enter a project folder name.");
      return;
    }
    const relativePath = browsePath ? `${browsePath}/${name}` : name;
    setUploadBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/pp/reports/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Create failed");
      setMsg(`Folder “${name}” created.`);
      setNewFolderName("");
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function uploadFiles(fl: FileList | null) {
    if (!fl?.length) return;
    setUploadBusy(true);
    setError("");
    setMsg("");
    try {
      for (const file of Array.from(fl)) {
        const pres = await fetch("/api/pp/reports/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relativePath: browsePath.trim() || null,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            byteSize: file.size,
          }),
        });
        const pj = await pres.json().catch(() => ({}));
        if (!pres.ok) throw new Error((pj as { message?: string }).message || "Presign failed");
        const uploadUrl = (pj as { uploadUrl?: string }).uploadUrl;
        const headers = (pj as { headers?: { "Content-Type"?: string } }).headers ?? {};
        if (!uploadUrl) throw new Error("No upload URL");
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": headers["Content-Type"] || file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      }
      setMsg(`Uploaded ${fl.length} file(s).`);
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteFile(key: string, label: string) {
    if (!globalThis.confirm(`Delete “${label}”?`)) return;
    setUploadBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pp/reports/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Delete failed");
      setMsg("Deleted.");
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function downloadFile(key: string) {
    const res = await fetch(`/api/pp/reports/download?key=${encodeURIComponent(key)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { message?: string }).message || "Download failed");
      return;
    }
    const u = (data as { downloadUrl?: string }).downloadUrl;
    if (u) globalThis.open(u, "_blank", "noopener,noreferrer");
  }

  const crumbs = browsePath ? browsePath.split("/").filter(Boolean) : [];

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Final reports storage is not configured. Set <span className="font-mono">WASABI_PP_REPORTS_BUCKET</span> on the
        server (same Wasabi user as employee files is OK).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}
      {msg && !error ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{msg}</div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-700">
          Upload finished reports here under <strong>project</strong> folders. Files stay in the dedicated PP reports bucket
          (not employee field storage).
        </p>
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700">
          Allowed types: {EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP}
        </p>

        <nav className="mt-3 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
          <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => setBrowsePath("")}>
            Root
          </button>
          {crumbs.map((part, i) => {
            const prefix = crumbs.slice(0, i + 1).join("/");
            return (
              <span key={prefix} className="flex items-center gap-1">
                <span className="text-zinc-400">/</span>
                <button type="button" className="hover:text-indigo-600 hover:underline" onClick={() => setBrowsePath(prefix)}>
                  {part}
                </button>
              </span>
            );
          })}
        </nav>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New project folder name"
            disabled={uploadBusy}
            className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createProjectFolder()}
            disabled={uploadBusy}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create folder
          </button>
          <input ref={fileRef} type="file" multiple className="sr-only" disabled={uploadBusy} onChange={(e) => void uploadFiles(e.target.files)} />
          <button
            type="button"
            disabled={uploadBusy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 disabled:opacity-50"
          >
            Upload files here
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Size</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-800">Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.path} className="border-b border-zinc-100">
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => setBrowsePath(f.path)}>
                        {f.name}/
                      </button>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">—</td>
                    <td className="px-3 py-2 text-right text-zinc-400">—</td>
                  </tr>
                ))}
                {files.map((f) => (
                  <tr key={f.key} className="border-b border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-900">{f.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{formatBytes(f.size)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => void downloadFile(f.key)} className="text-indigo-600 hover:underline">
                        Download
                      </button>
                      {" · "}
                      <button
                        type="button"
                        disabled={uploadBusy}
                        onClick={() => void deleteFile(f.key, f.name)}
                        className="text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {folders.length === 0 && files.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-zinc-500">
                      Empty. Create a project folder or upload files.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
