"use client";

import type { SkippedUpload } from "@/lib/employee-files/upload-filter";

export type UploadModalRow = {
  id: string;
  displayName: string;
  storagePath?: string;
  status: "queued" | "uploading" | "done" | "failed";
  bytesLoaded: number;
  bytesTotal: number;
  errorMessage?: string;
};

type Props = {
  open: boolean;
  step: "review" | "upload" | "done";
  kind: "files" | "folder";
  folderName?: string;
  employeeLabel?: string;
  targetLocationLabel: string;
  skipped: SkippedUpload[];
  rows: UploadModalRow[];
  busy: boolean;
  overallPercent: number;
  summary?: { uploaded: number; failed: number; skipped: number };
  pageError?: string;
  onClose: () => void;
  onStartUpload: () => void;
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminUploadModal({
  open,
  step,
  kind,
  folderName,
  employeeLabel,
  targetLocationLabel,
  skipped,
  rows,
  busy,
  overallPercent,
  summary,
  pageError,
  onClose,
  onStartUpload,
}: Props) {
  if (!open) return null;

  const totalFiles = rows.length;
  const showProgress = step === "upload" || step === "done";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-upload-modal-title"
      >
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 id="admin-upload-modal-title" className="text-lg font-semibold text-zinc-900">
            {step === "review" ? "Confirm upload" : step === "upload" ? "Uploading…" : "Upload finished"}
          </h2>
          {employeeLabel ? (
            <p className="mt-1 text-xs text-zinc-600">
              Employee: <strong className="text-zinc-900">{employeeLabel}</strong>
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-600">
            Destination: <span className="font-mono text-zinc-800">{targetLocationLabel}</span>
          </p>
          {kind === "folder" && folderName ? (
            <p className="mt-1 text-xs text-zinc-600">
              Folder from disk: <strong className="text-zinc-900">{folderName}</strong> — {totalFiles} file(s) to upload
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-600">
              {totalFiles} file{totalFiles === 1 ? "" : "s"} selected
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {skipped.length > 0 ? (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <strong>{skipped.length}</strong> file(s) will be skipped (unsupported type or empty):{" "}
              <span className="font-mono">{skipped.slice(0, 8).map((s) => s.name).join(", ")}</span>
              {skipped.length > 8 ? "…" : ""}
            </div>
          ) : null}

          {pageError ? <p className="mb-3 text-sm text-red-600">{pageError}</p> : null}

          {showProgress ? (
            <div className="mb-4">
              <div className="mb-1 flex justify-between text-xs font-medium text-zinc-700">
                <span>Overall progress</span>
                <span>{Math.round(overallPercent)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, overallPercent))}%` }}
                />
              </div>
            </div>
          ) : null}

          <ul className="space-y-2 text-sm">
            {rows.map((r) => {
              const pct =
                r.bytesTotal > 0 ? Math.min(100, Math.round((100 * r.bytesLoaded) / r.bytesTotal)) : r.status === "done" ? 100 : 0;
              return (
                <li key={r.id} className="rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-900">{r.displayName}</span>
                    <span
                      className={
                        r.status === "done"
                          ? "text-xs font-medium text-emerald-700"
                          : r.status === "failed"
                            ? "text-xs font-medium text-red-600"
                            : r.status === "uploading"
                              ? "text-xs font-medium text-indigo-700"
                              : "text-xs text-zinc-500"
                      }
                    >
                      {r.status === "queued"
                        ? "Queued"
                        : r.status === "uploading"
                          ? `Uploading ${pct}%`
                          : r.status === "done"
                            ? "Done"
                            : "Failed"}
                    </span>
                  </div>
                  {r.storagePath ? (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500" title={r.storagePath}>
                      → {r.storagePath}
                    </p>
                  ) : null}
                  {r.status === "uploading" ? (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-200">
                      <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-150" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <p className="mt-1 text-[10px] text-zinc-500">
                    {formatBytes(r.bytesLoaded)} / {formatBytes(r.bytesTotal)}
                  </p>
                  {r.errorMessage ? <p className="mt-1 text-xs text-red-600">{r.errorMessage}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          {step === "review" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onStartUpload}
                disabled={busy || totalFiles === 0}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {totalFiles === 0 ? "Nothing to upload" : "Upload"}
              </button>
            </>
          ) : step === "upload" ? (
            <span className="text-xs text-zinc-500">{busy ? "Please keep this tab open…" : ""}</span>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {summary ? (
                <p className="text-sm text-zinc-700">
                  Uploaded <strong>{summary.uploaded}</strong> of {rows.length} file(s).
                  {summary.failed ? (
                    <>
                      {" "}
                      <span className="text-red-600">{summary.failed} failed</span>.
                    </>
                  ) : null}
                  {summary.skipped ? (
                    <>
                      {" "}
                      <span className="text-amber-800">{summary.skipped} skipped</span> before upload.
                    </>
                  ) : null}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
