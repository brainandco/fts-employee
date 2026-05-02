"use client";

import { useCallback, useEffect, useState, type InputHTMLAttributes } from "react";
import { employeeUploadFilesBatch } from "@/lib/employee-files/batch-upload-client";

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

/** Match server `formatMonthYearFolder` / `formatDayMonthYearFolder` (en-US). */
function monthYearFolder(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  return `${m}-${d.getFullYear()}`;
}

function dayMonthYearFolder(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  return `${d.getDate()}-${m}-${d.getFullYear()}`;
}

function todayStoragePath(): string {
  const d = new Date();
  return `${monthYearFolder(d)}/${dayMonthYearFolder(d)}`;
}

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** One folder segment under the current path (no slashes). */
function sanitizeSubfolderName(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.includes("/") || t.includes("\\") || t === "." || t === "..") return null;
  const cleaned = t.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return cleaned || null;
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
  const [newSubfolderName, setNewSubfolderName] = useState("");

  const uploadTargetPath = browsePath.trim();

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
      load().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [hasRegion, hasRegionFolder, canView, load]);

  useEffect(() => {
    if (hasRegion && hasRegionFolder) {
      void loadBrowse();
    }
  }, [hasRegion, hasRegionFolder, browsePath, loadBrowse]);

  async function refreshAll() {
    setLoading(true);
    try {
      await Promise.all([canView ? load() : Promise.resolve(), loadBrowse()]);
    } finally {
      setLoading(false);
    }
  }

  async function createSubfolder() {
    const segment = sanitizeSubfolderName(newSubfolderName);
    if (!segment) {
      setError("Enter a single folder name (no slashes), e.g. Reports or Invoices.");
      return;
    }
    const relativePath = uploadTargetPath ? `${uploadTargetPath}/${segment}` : segment;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/employee-files/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message || "Create folder failed");
      setMsg(`Folder “${segment}” created.`);
      setNewSubfolderName("");
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create folder failed");
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
      const base = uploadTargetPath;
      const items = Array.from(list).map((f) => {
        const wr = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
        const sub = wr && wr.includes("/") ? wr.slice(0, wr.lastIndexOf("/")) : "";
        const combined = [base, sub.replace(/\\/g, "/")].filter(Boolean).join("/");
        return { file: f, ...(combined ? { relativePath: combined } : {}) };
      });
      const { uploaded, failed } = await employeeUploadFilesBatch(items);
      setMsg(`Uploaded ${uploaded} file(s).${failed.length ? ` ${failed.length} could not be uploaded.` : ""}`);
      if (failed.length) {
        setError(failed.slice(0, 6).map((x) => `${x.name}: ${x.message}`).join(" · "));
      }
      if (canView) await load();
      await loadBrowse();
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
      await loadBrowse();
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
    await loadBrowse();
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
        <p className="font-medium text-zinc-900">How this works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600">
          <li>Open folders below (your storage is under Region → your name → dates and any folders you add).</li>
          <li>
            <strong>Uploads go into the folder you are viewing.</strong> At root, files go into today&apos;s Month-Year /
            Day folder automatically.
          </li>
          <li>
            To add a new folder <em>inside the current location</em>, type one name under &quot;New folder&quot; and click
            Create — that is the only place folders are created.
          </li>
        </ol>
      </div>

      {!canView ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          Download and delete are available for Project Managers, PP, and Team Leads. You can still open folders, upload
          here, and create subfolders.
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Your folders</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Click a folder to open it. Upload buttons below always use this location.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || browseLoading}
              onClick={() => setBrowsePath(todayStoragePath())}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Open today&apos;s folder
            </button>
            <button
              type="button"
              disabled={busy || browseLoading}
              onClick={() => void refreshAll()}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Refresh
            </button>
            {canView ? (
              <button
                type="button"
                onClick={deleteAll}
                disabled={busy || files.length === 0}
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 shadow-sm hover:bg-rose-100 disabled:opacity-50"
              >
                Delete all my files
              </button>
            ) : null}
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-900">
          {uploadTargetPath ? (
            <>
              Current location: <span className="font-mono text-emerald-950">{uploadTargetPath}</span>
            </>
          ) : (
            <>
              Current location: <strong>Home</strong> (uploads use today&apos;s path:{" "}
              <span className="font-mono">{todayStoragePath()}</span>)
            </>
          )}
        </p>

        <nav className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
          <button
            type="button"
            className="font-medium text-indigo-600 hover:underline"
            onClick={() => setBrowsePath("")}
          >
            Home
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
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-zinc-800">Size</th>
                  {canView ? <th className="px-3 py-2 text-right font-medium text-zinc-800">Actions</th> : null}
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
                    {canView ? <td className="px-3 py-2 text-right text-zinc-400">—</td> : null}
                  </tr>
                ))}
                {browseFiles.map((f) => (
                  <tr key={f.key} className="border-b border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-900">{f.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{formatBytes(f.size)}</td>
                    {canView ? (
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
                    ) : null}
                  </tr>
                ))}
                {browseFolders.length === 0 && browseFiles.length === 0 ? (
                  <tr>
                    <td colSpan={canView ? 3 : 2} className="px-3 py-6 text-center text-zinc-500">
                      This folder is empty. Create a subfolder below or upload files.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New folder (inside current location)</h4>
          <p className="mt-1 text-xs text-zinc-500">
            Only this field creates folders. Enter a <strong>single</strong> name (e.g. <code className="rounded bg-zinc-100 px-1">Reports</code>
            ) — it appears inside the folder you have open above.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              type="text"
              value={newSubfolderName}
              onChange={(e) => setNewSubfolderName(e.target.value)}
              placeholder="e.g. Reports"
              disabled={busy}
              className="min-w-[200px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createSubfolder()}
              disabled={busy}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create folder
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-900">Upload into current location</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Types: pdf, Office, csv, zip, rar, 7z (server limit applies). Folder upload keeps inner paths under the location
          shown in green above.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-800">Files</label>
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
                    const { uploaded, failed } = await employeeUploadFilesBatch(
                      Array.from(list).map((f) => ({ file: f })),
                      uploadTargetPath ? { defaultRelativePath: uploadTargetPath } : {}
                    );
                    setMsg(`Uploaded ${uploaded} file(s).${failed.length ? ` ${failed.length} could not be uploaded.` : ""}`);
                    if (failed.length) {
                      setError(failed.slice(0, 6).map((x) => `${x.name}: ${x.message}`).join(" · "));
                    }
                    if (canView) await load();
                    await loadBrowse();
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
            <label className="mb-1 block text-sm font-medium text-zinc-800">Folder from your computer</label>
            <input
              type="file"
              disabled={busy}
              multiple
              {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => {
                void uploadFolderPick(e.target.files);
                e.target.value = "";
              }}
              className="block w-full text-sm text-zinc-800 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
          </div>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {canView ? (
        loading ? (
          <p className="text-sm text-zinc-500">Loading file list…</p>
        ) : files.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
            No completed uploads in your account list yet. After uploads finish, they appear here for search and audit.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <p className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">All your files (list)</p>
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
        )
      ) : null}
    </div>
  );
}
