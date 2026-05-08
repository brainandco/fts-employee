"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP } from "@/lib/employee-files/storage";

const API = "/api/pm/pp-reports";

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

export function PmPpReportsBucketClient({ configured }: { configured: boolean }) {
  const [browsePath, setBrowsePath] = useState("");
  const [folders, setFolders] = useState<BrowseFolder[]>([]);
  const [files, setFiles] = useState<BrowseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const [selectedZipPaths, setSelectedZipPaths] = useState<string[]>([]);
  const [zipBulkBusy, setZipBulkBusy] = useState(false);

  const loadBrowse = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const q = browsePath ? `?path=${encodeURIComponent(browsePath)}` : "";
      const res = await fetch(`${API}/browse${q}`);
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        const msg = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "";
        throw new Error(msg || `Browse failed (HTTP ${res.status}). Check WASABI_PP_REPORTS_BUCKET and Wasabi credentials.`);
      }
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

  useEffect(() => {
    setSelectedZipPaths([]);
  }, [browsePath]);

  function toggleZipFolderSelection(folderPath: string) {
    setSelectedZipPaths((prev) =>
      prev.includes(folderPath) ? prev.filter((p) => p !== folderPath) : [...prev, folderPath]
    );
  }

  function triggerFolderZipDownload(folderPath: string) {
    const u = new URL(`${API}/folder-zip`, window.location.origin);
    u.searchParams.set("path", folderPath);
    window.location.href = u.toString();
  }

  async function downloadSelectedFoldersZip() {
    if (selectedZipPaths.length === 0) return;
    setZipBulkBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch(`${API}/folder-zip-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: selectedZipPaths }),
      });
      const ct = res.headers.get("Content-Type") ?? "";
      if (!res.ok) {
        const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};
        throw new Error((data as { message?: string }).message || "Download failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = "folders.zip";
      if (cd) {
        const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        const plain = /filename="([^"]+)"/i.exec(cd);
        if (star?.[1]) filename = decodeURIComponent(star[1]);
        else if (plain?.[1]) filename = plain[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Download started (${selectedZipPaths.length} folder${selectedZipPaths.length === 1 ? "" : "s"}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setZipBulkBusy(false);
    }
  }

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
      const res = await fetch(`${API}/folders`, {
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
        const pres = await fetch(`${API}/presign`, {
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
      const res = await fetch(`${API}/delete`, {
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
    const res = await fetch(`${API}/download?key=${encodeURIComponent(key)}`);
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
        PP final reports storage is not configured. Set <span className="font-mono">WASABI_PP_REPORTS_BUCKET</span> on the
        admin server. Optionally set <span className="font-mono">WASABI_PP_REPORTS_ACCESS_KEY</span> and related vars for a
        dedicated PP Wasabi user; otherwise the employee-files credentials are used.
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
          Browse and manage the dedicated Wasabi bucket where Post Processors upload <strong>final reports</strong> (project
          folders). This is separate from regional employee field files.
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

        {selectedZipPaths.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-950">
            <span className="font-medium">
              {selectedZipPaths.length} folder{selectedZipPaths.length === 1 ? "" : "s"} selected for ZIP
            </span>
            <button
              type="button"
              disabled={zipBulkBusy || uploadBusy}
              onClick={() => void downloadSelectedFoldersZip()}
              className="rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {zipBulkBusy ? "Preparing…" : "Download selected as ZIP"}
            </button>
            <button
              type="button"
              disabled={zipBulkBusy}
              onClick={() => setSelectedZipPaths([])}
              className="rounded-md border border-indigo-200 bg-white px-2.5 py-1 font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="w-10 px-2 py-2 text-center font-medium text-zinc-800">
                    <span className="sr-only">Include in multi-folder ZIP</span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Size</th>
                  <th className="px-3 py-2 text-right font-medium text-zinc-800">Actions</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr key={f.path} className="border-b border-zinc-100">
                    <td className="w-10 px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedZipPaths.includes(f.path)}
                        disabled={uploadBusy}
                        title="Include in multi-folder ZIP download"
                        aria-label={`Include folder ${f.name} in ZIP bundle`}
                        onChange={() => toggleZipFolderSelection(f.path)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => setBrowsePath(f.path)}>
                        {f.name}/
                      </button>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">—</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={uploadBusy}
                        onClick={() => triggerFolderZipDownload(f.path)}
                        className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                      >
                        Download zip
                      </button>
                    </td>
                  </tr>
                ))}
                {files.map((f) => (
                  <tr key={f.key} className="border-b border-zinc-100">
                    <td className="w-10 px-2 py-2" aria-hidden />
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
                    <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
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
