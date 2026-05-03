"use client";

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { PpFieldUploadModal, type UploadModalRow } from "@/components/pp/PpFieldUploadModal";
import { EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP } from "@/lib/employee-files/storage";
import { filterEmployeeUploadItems, type SkippedUpload } from "@/lib/employee-files/upload-filter";
import { ppReportsUploadFilesBatch, type PpReportsUploadItem } from "@/lib/pp/pp-reports-batch-upload";

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

function folderLabelFromPickedFiles(files: File[]): string | undefined {
  const f = files[0] as File & { webkitRelativePath?: string };
  const wr = f?.webkitRelativePath;
  if (!wr) return undefined;
  const seg = wr.split("/")[0];
  return seg || undefined;
}

function buildReportsFolderUploadItems(picked: File[], browsePathUnderReporter: string): PpReportsUploadItem[] {
  return picked.map((f) => {
    const wr = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    const sub = wr && wr.includes("/") ? wr.slice(0, wr.lastIndexOf("/")) : "";
    const combined = [browsePathUnderReporter, sub.replace(/\\/g, "/")].filter(Boolean).join("/");
    return { file: f, ...(combined ? { relativePath: combined } : {}) };
  });
}

function buildReportsUploadRows(items: PpReportsUploadItem[], kind: "files" | "folder", browsePath: string): UploadModalRow[] {
  const rootLabel = browsePath.trim() || "(your folder)";
  return items.map((it, i) => {
    const rel = it.relativePath?.trim();
    const pathDisplay = kind === "folder" && rel ? `${rel}/${it.file.name}` : rootLabel;
    return {
      id: String(i),
      displayName: it.file.name,
      storagePath: pathDisplay,
      status: "queued",
      bytesLoaded: 0,
      bytesTotal: Math.max(0, it.file.size),
    };
  });
}

function overallUploadPercent(rows: UploadModalRow[]): number {
  let sumWt = 0;
  let sumDone = 0;
  for (const r of rows) {
    const w = Math.max(1, r.bytesTotal);
    sumWt += w;
    if (r.status === "done" || r.status === "failed") sumDone += w;
    else if (r.status === "uploading") sumDone += Math.min(Math.max(0, r.bytesLoaded), r.bytesTotal);
  }
  return sumWt > 0 ? (100 * sumDone) / sumWt : 0;
}

function mergeFailedIntoRows(
  rows: UploadModalRow[],
  failed: { name: string; message: string }[],
  baseline: UploadModalRow[]
): UploadModalRow[] {
  if (!failed.length) return rows;
  const byName = new Map(failed.map((f) => [f.name, f.message]));
  return rows.map((r, i) => {
    if (r.status === "failed" && r.errorMessage) return r;
    const msg = byName.get(r.displayName) ?? byName.get(baseline[i]?.displayName ?? "");
    if (msg) return { ...r, status: "failed" as const, errorMessage: msg };
    return r;
  });
}

type UploadSessionState = {
  step: "review" | "upload" | "done";
  kind: "files" | "folder";
  folderName?: string;
  items: PpReportsUploadItem[];
  skipped: SkippedUpload[];
  rows: UploadModalRow[];
  busy: boolean;
  pageError?: string;
  summary?: { uploaded: number; failed: number; skipped: number };
};

export function PpReportsClient({
  configured,
  reporterFullName,
}: {
  configured: boolean;
  reporterFullName?: string | null;
}) {
  const [browsePath, setBrowsePath] = useState("");
  const [folders, setFolders] = useState<BrowseFolder[]>([]);
  const [files, setFiles] = useState<BrowseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadSession, setUploadSession] = useState<UploadSessionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);

  const loadBrowse = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError("");
    try {
      const q = browsePath ? `?path=${encodeURIComponent(browsePath)}` : "";
      const res = await fetch(`/api/pp/reports/browse${q}`);
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        const m = typeof data.message === "string" && data.message.trim() ? data.message.trim() : "";
        throw new Error(m || `Browse failed (HTTP ${res.status}). Check Vercel env: WASABI_PP_REPORTS_BUCKET and Wasabi credentials for this app.`);
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
      setMsg(`Folder “${name}” created under your personal folder.`);
      setNewFolderName("");
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setUploadBusy(false);
    }
  }

  function openUploadReview(kind: "files" | "folder", picked: File[]) {
    const base = browsePath.trim();
    const rawItems: PpReportsUploadItem[] =
      kind === "folder" ? buildReportsFolderUploadItems(picked, base) : picked.map((file) => ({ file }));
    const { allowed, skipped } = filterEmployeeUploadItems(rawItems);
    const rows = buildReportsUploadRows(allowed, kind, browsePath);
    setUploadSession({
      step: "review",
      kind,
      folderName: kind === "folder" ? folderLabelFromPickedFiles(picked) : undefined,
      items: allowed,
      skipped,
      rows,
      busy: false,
    });
  }

  function closeUploadModal() {
    if (uploadInFlightRef.current) return;
    setUploadSession(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  async function runUploadFromSession() {
    const session = uploadSession;
    if (!session || session.items.length === 0) return;
    uploadInFlightRef.current = true;
    const baseline = session.rows;
    setUploadSession({
      ...session,
      step: "upload",
      busy: true,
      pageError: undefined,
      rows: session.rows.map((r) => ({ ...r, status: "queued" as const, bytesLoaded: 0, errorMessage: undefined })),
    });

    try {
      const result = await ppReportsUploadFilesBatch(session.items, {
        defaultRelativePath: browsePath.trim() || undefined,
        callbacks: {
          onFileStatus: (index, status, message) => {
            setUploadSession((prev) => {
              if (!prev || prev.step !== "upload") return prev;
              const rows = prev.rows.map((r, i) =>
                i === index
                  ? {
                      ...r,
                      status,
                      errorMessage: status === "failed" ? message : undefined,
                    }
                  : r
              );
              return { ...prev, rows };
            });
          },
          onFileProgress: (index, loaded, total) => {
            setUploadSession((prev) => {
              if (!prev || prev.step !== "upload") return prev;
              const rows = prev.rows.map((r, i) =>
                i === index ? { ...r, bytesLoaded: loaded, bytesTotal: Math.max(r.bytesTotal, total) } : r
              );
              return { ...prev, rows };
            });
          },
        },
      });

      setUploadSession((prev) => {
        if (!prev) return prev;
        const failedPairs = result.failed;
        const merged = mergeFailedIntoRows(prev.rows, failedPairs, baseline);
        return {
          ...prev,
          step: "done",
          busy: false,
          rows: merged,
          summary: {
            uploaded: result.uploaded,
            failed: failedPairs.length,
            skipped: prev.skipped.length,
          },
        };
      });

      if (result.uploaded > 0) {
        setMsg(`Uploaded ${result.uploaded} file(s).`);
        await loadBrowse();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setUploadSession((prev) =>
        prev
          ? {
              ...prev,
              step: "done",
              busy: false,
              pageError: message,
              summary: { uploaded: 0, failed: prev.items.length, skipped: prev.skipped.length },
            }
          : prev
      );
    } finally {
      uploadInFlightRef.current = false;
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

  const displayName = reporterFullName?.trim() || "Your folder";

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Final reports storage is not configured. Set <span className="font-mono">WASABI_PP_REPORTS_BUCKET</span> on the
        server. Optional: <span className="font-mono">WASABI_PP_REPORTS_ACCESS_KEY</span> (+ secret, region, endpoint) for a
        dedicated PP user; otherwise employee-files credentials are used.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {uploadSession ? (
        <PpFieldUploadModal
          open
          step={uploadSession.step}
          kind={uploadSession.kind}
          folderName={uploadSession.folderName}
          employeeLabel={displayName}
          actorRoleNoun="Reporter"
          targetLocationLabel={`Final reports › ${displayName}${browsePath.trim() ? ` › ${browsePath.trim()}` : ""}`}
          skipped={uploadSession.skipped}
          rows={uploadSession.rows}
          busy={uploadSession.busy}
          overallPercent={overallUploadPercent(uploadSession.rows)}
          summary={uploadSession.summary}
          pageError={uploadSession.pageError}
          onClose={closeUploadModal}
          onStartUpload={() => void runUploadFromSession()}
        />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}
      {msg && !error ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{msg}</div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-700">
          Upload finished reports under <strong>project</strong> folders. Your files are stored under a folder named for you
          (same idea as field employees); you only pick the project folder name — not your own name folder.
        </p>
        <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700">
          Allowed types: {EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP}
        </p>

        <nav className="mt-3 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
          <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => setBrowsePath("")}>
            My reports
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
            disabled={uploadBusy || !!uploadSession}
            className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createProjectFolder()}
            disabled={uploadBusy || !!uploadSession}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            disabled={uploadBusy || !!uploadSession}
            onChange={(e) => {
              const fl = e.target.files;
              if (fl?.length) openUploadReview("files", Array.from(fl));
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="sr-only"
            multiple
            disabled={uploadBusy || !!uploadSession}
            {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
            onChange={(e) => {
              const fl = e.target.files;
              if (fl?.length) openUploadReview("folder", Array.from(fl));
            }}
          />
          <button
            type="button"
            disabled={uploadBusy || !!uploadSession}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-900 disabled:opacity-50"
          >
            Upload files…
          </button>
          <button
            type="button"
            disabled={uploadBusy || !!uploadSession}
            onClick={() => folderInputRef.current?.click()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Upload folder…
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
