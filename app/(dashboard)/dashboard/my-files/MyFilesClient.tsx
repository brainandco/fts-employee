"use client";

import { useCallback, useEffect, useMemo, useState, type InputHTMLAttributes } from "react";

type FileRow = {
  id: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  upload_status: string;
  created_at: string;
  region_id: string;
};

type BrowseFolder = { type: "folder"; name: string; path: string };
type BrowseFile = {
  type: "file";
  name: string;
  key: string;
  size: number | null;
  lastModified: string | null;
  db: {
    id: string;
    file_name: string;
    mime_type: string | null;
    byte_size: number | null;
    upload_status: string;
    created_at: string;
  } | null;
};

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function presignUpload(file: File, relativePath?: string) {
  const pres = await fetch("/api/employee-files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      byteSize: file.size,
      ...(relativePath?.trim() ? { relativePath: relativePath.trim() } : {}),
    }),
  });
  const pr = await pres.json();
  if (!pres.ok) throw new Error(typeof pr.message === "string" ? pr.message : "Presign failed");
  const h = (pr as { headers?: { "Content-Type"?: string } }).headers;
  const put = await fetch((pr as { uploadUrl: string }).uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": h?.["Content-Type"] || file.type || "application/octet-stream" },
  });
  if (!put.ok) throw new Error("Upload to storage failed");
  const comp = await fetch(`/api/employee-files/${(pr as { id: string }).id}/complete`, { method: "POST" });
  const cj = await comp.json();
  if (!comp.ok) throw new Error(typeof cj.message === "string" ? cj.message : "Complete failed");
  return pr as { id: string };
}

export function MyFilesClient({
  hasRegion,
  hasRegionFolder,
  canView,
}: {
  hasRegion: boolean;
  hasRegionFolder: boolean;
  canView: boolean;
}) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [browsePath, setBrowsePath] = useState("");
  const [browseFolders, setBrowseFolders] = useState<BrowseFolder[]>([]);
  const [browseFiles, setBrowseFiles] = useState<BrowseFile[]>([]);

  const [uploadRelativePath, setUploadRelativePath] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");

  const effectiveUploadPath = useMemo(() => {
    const manual = uploadRelativePath.trim();
    if (manual) return manual;
    return browsePath.trim();
  }, [uploadRelativePath, browsePath]);

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

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    setError("");
    try {
      const q = browsePath ? `?path=${encodeURIComponent(browsePath)}` : "";
      const res = await fetch(`/api/employee-files/browse${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Browse failed");
      setBrowseFolders((data as { folders?: BrowseFolder[] }).folders ?? []);
      setBrowseFiles((data as { files?: BrowseFile[] }).files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Browse failed");
      setBrowseFolders([]);
      setBrowseFiles([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [browsePath]);

  useEffect(() => {
    if (hasRegion && hasRegionFolder && canView) {
      setLoading(true);
      load()
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [hasRegion, hasRegionFolder, canView, load]);

  useEffect(() => {
    if (hasRegion && hasRegionFolder && canView) {
      void loadBrowse();
    }
  }, [hasRegion, hasRegionFolder, canView, browsePath, loadBrowse]);

  async function uploadOne(f: File, relativePath?: string) {
    if (!f.size) {
      setError("Empty file");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await presignUpload(f, relativePath);
      setMsg("File uploaded successfully.");
      await load();
      if (canView) await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFolderPick(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const base = effectiveUploadPath;
      for (const f of Array.from(list)) {
        const wr = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
        const sub = wr && wr.includes("/") ? wr.slice(0, wr.lastIndexOf("/")) : "";
        const combined = [base, sub.replace(/\\/g, "/")].filter(Boolean).join("/");
        await presignUpload(f, combined || undefined);
      }
      setMsg(`Uploaded ${list.length} file(s).`);
      await load();
      if (canView) await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const rel = newFolderPath.trim();
    if (!rel) {
      setError("Enter a folder path.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/employee-files/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath: rel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Create folder failed");
      setMsg("Folder created.");
      setNewFolderPath("");
      if (canView) await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create folder failed");
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
      if (canView) await loadBrowse();
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
    if (canView) await loadBrowse();
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

  const breadcrumbParts = browsePath ? browsePath.split("/").filter(Boolean) : [];

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
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Storage layout</p>
        <p className="mt-1 text-xs text-zinc-600">
          Region → your name folder → Month-Year → Day-Month-Year → files. Uploads without a custom path use today&apos;s
          Month-Year and Day folders automatically.
        </p>
      </div>

      {!canView ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          Viewing and deleting files is available for Project Managers, PP, and Team Leads. You can still upload, create
          folders, and upload whole folders from your computer.
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800">Upload file(s)</label>
            <input
              type="file"
              multiple
              disabled={busy}
              onChange={(e) => {
                const list = e.target.files;
                e.target.value = "";
                if (!list?.length) return;
                void (async () => {
                  setBusy(true);
                  setError("");
                  setMsg("");
                  try {
                    const base = effectiveUploadPath;
                    for (const f of Array.from(list)) {
                      await presignUpload(f, base || undefined);
                    }
                    setMsg(`Uploaded ${list.length} file(s).`);
                    await load();
                    if (canView) await loadBrowse();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="block w-full text-sm text-zinc-800 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800">Upload folder (from your computer)</label>
            <input
              type="file"
              disabled={busy}
              multiple
              {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => {
                void uploadFolderPick(e.target.files);
                e.target.value = "";
              }}
              className="block w-full text-sm text-zinc-800 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Relative paths from your folder are preserved under the optional path below. Allowed types include pdf,
              Office, csv, zip, rar, 7z (server limit applies).
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Optional path under your storage (e.g. Apr-2026/28-Apr-2026). Leave empty to use today&apos;s folders
              {canView && browsePath ? ", or rely on browse path below." : "."}
            </label>
            <input
              type="text"
              value={uploadRelativePath}
              onChange={(e) => setUploadRelativePath(e.target.value)}
              placeholder="Apr-2026/28-Apr-2026"
              disabled={busy}
              className="w-full max-w-xl rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {canView ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                Promise.all([load(), loadBrowse()]).finally(() => setLoading(false));
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
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Create folder</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Creates an empty folder marker in Wasabi under your employee path (segments under Month-Year / Day if needed).
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={newFolderPath}
            onChange={(e) => setNewFolderPath(e.target.value)}
            placeholder="Apr-2026/28-Apr-2026/Reports"
            disabled={busy}
            className="min-w-[240px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createFolder()}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canView ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Browse</h3>
          <nav className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
            <button
              type="button"
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => setBrowsePath("")}
            >
              Root
            </button>
            {breadcrumbParts.map((part, i) => {
              const prefix = breadcrumbParts.slice(0, i + 1).join("/");
              return (
                <span key={prefix} className="flex items-center gap-1">
                  <span className="text-zinc-400">/</span>
                  <button
                    type="button"
                    className="hover:text-indigo-600 hover:underline"
                    onClick={() => setBrowsePath(prefix)}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </nav>
          {browseLoading ? (
            <p className="mt-3 text-sm text-zinc-500">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-3 py-2 text-left font-medium text-zinc-800">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-zinc-800">Size</th>
                    <th className="px-3 py-2 text-right font-medium text-zinc-800">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {browseFolders.map((f) => (
                    <tr key={f.path} className="border-b border-zinc-100">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium text-indigo-600 hover:underline"
                          onClick={() => setBrowsePath(f.path)}
                        >
                          {f.name}/
                        </button>
                      </td>
                      <td className="px-3 py-2 text-zinc-500">—</td>
                      <td className="px-3 py-2 text-right text-zinc-400">—</td>
                    </tr>
                  ))}
                  {browseFiles.map((f) => (
                    <tr key={f.key} className="border-b border-zinc-100">
                      <td className="px-3 py-2 font-medium text-zinc-900">{f.name}</td>
                      <td className="px-3 py-2 text-zinc-600">{formatBytes(f.size)}</td>
                      <td className="px-3 py-2 text-right">
                        {f.db?.id && f.db.upload_status === "active" ? (
                          <button
                            type="button"
                            onClick={() => downloadFile(f.db!.id)}
                            className="text-indigo-600 hover:underline"
                          >
                            Download
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                        {f.db?.id ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => removeRow(f.db!.id)}
                              disabled={busy}
                              className="text-rose-600 hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {browseFolders.length === 0 && browseFiles.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-zinc-500">
                        Nothing in this folder.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {!canView ? null : loading ? (
        <p className="text-sm text-zinc-500">Loading file list…</p>
      ) : files.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          No rows in your personal file list yet (database view). Uploaded files appear here after completion.
        </div>
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
                  <td className="px-4 py-2.5 text-zinc-600">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.upload_status === "active" ? (
                      <button type="button" onClick={() => downloadFile(r.id)} className="text-indigo-600 hover:underline">
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
