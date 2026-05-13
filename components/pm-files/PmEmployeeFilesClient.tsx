"use client";

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { AdminUploadModal, type UploadModalRow } from "@/components/pm-files/AdminUploadModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { pmUploadFilesBatch, type PmUploadItem } from "@/lib/pm-files/pm-batch-upload-client";
import { EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP } from "@/lib/employee-files/storage";
import { filterEmployeeUploadItems, type SkippedUpload } from "@/lib/employee-files/upload-filter";

export type PmEmployeeFilesFolder = {
  id: string;
  regionId: string;
  pathSegment: string;
  createdAt: string;
  regionName: string;
  regionCode: string | null;
};
type FileRow = {
  id: string;
  fileName: string;
  mimeType: string | null;
  byteSize: number | null;
  uploadStatus: string;
  createdAt: string;
  employeeName: string;
  employeeEmail: string | null;
};

type Assignee = { id: string; fullName: string; email: string | null; folderSlug: string };

type SiteSearchHit = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string | null;
  siteFolderName: string;
  pathUnderEmployee: string;
  parentPathBeforeSite: string;
  fileCountInSubtree: number;
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

function monthYearFolder(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  return `${m}-${d.getFullYear()}`;
}

function dayMonthYearFolder(d: Date): string {
  const m = d.toLocaleString("en-US", { month: "short" });
  return `${d.getDate()}-${m}-${d.getFullYear()}`;
}

function todayEmployeeSubpath(): string {
  const d = new Date();
  return `${monthYearFolder(d)}/${dayMonthYearFolder(d)}`;
}

function sanitizeSubfolderName(raw: string): string | null {
  const t = raw.trim();
  if (!t || t.includes("/") || t.includes("\\") || t === "." || t === "..") return null;
  const cleaned = t.replace(/[^\w.\-()+ @&$=!*,?:;]/g, "_").slice(0, 120);
  return cleaned || null;
}

function folderLabelFromPickedFiles(files: File[]): string | undefined {
  const f = files[0] as File & { webkitRelativePath?: string };
  const wr = f?.webkitRelativePath;
  if (!wr) return undefined;
  const seg = wr.split("/")[0];
  return seg || undefined;
}

function buildFolderUploadItemsAdmin(picked: File[], base: string): PmUploadItem[] {
  return picked.map((f) => {
    const wr = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    const sub = wr && wr.includes("/") ? wr.slice(0, wr.lastIndexOf("/")) : "";
    const combined = [base, sub.replace(/\\/g, "/")].filter(Boolean).join("/");
    return { file: f, ...(combined ? { relativePath: combined } : {}) };
  });
}

function buildAdminUploadRows(items: PmUploadItem[], kind: "files" | "folder", pathLabel: string): UploadModalRow[] {
  const destLabel = pathLabel.trim() || todayEmployeeSubpath();
  return items.map((it, i) => {
    const rel = it.relativePath?.trim();
    const pathDisplay = kind === "folder" && rel ? `${rel}/${it.file.name}` : destLabel;
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
  items: PmUploadItem[];
  skipped: SkippedUpload[];
  rows: UploadModalRow[];
  busy: boolean;
  pageError?: string;
  summary?: { uploaded: number; failed: number; skipped: number };
};

export function PmEmployeeFilesClient({ initialFolders }: { initialFolders: PmEmployeeFilesFolder[] }) {
  const [folders, setFolders] = useState<PmEmployeeFilesFolder[]>(initialFolders);
  const [regionId, setRegionId] = useState<string>(initialFolders[0]?.regionId ?? "");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [uploadEmployeeId, setUploadEmployeeId] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  const [browseAtRegionRoot, setBrowseAtRegionRoot] = useState(true);
  const [browseEmployeeId, setBrowseEmployeeId] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState("");
  const [browseFolders, setBrowseFolders] = useState<BrowseFolder[]>([]);
  const [browseFiles, setBrowseFiles] = useState<BrowseFile[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [adminNewSubfolder, setAdminNewSubfolder] = useState("");
  const [adminUploadPathOverride, setAdminUploadPathOverride] = useState("");
  const [uploadSession, setUploadSession] = useState<UploadSessionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<{ id: string; label: string } | null>(null);

  const [siteSearchQuery, setSiteSearchQuery] = useState("");
  const [siteSearchLoading, setSiteSearchLoading] = useState(false);
  const [siteSearchResults, setSiteSearchResults] = useState<SiteSearchHit[]>([]);
  const [siteSearchTruncated, setSiteSearchTruncated] = useState(false);
  const [siteSearchError, setSiteSearchError] = useState("");
  const [siteSearchHasRun, setSiteSearchHasRun] = useState(false);

  const [selectedZipPaths, setSelectedZipPaths] = useState<string[]>([]);
  const [zipBulkBusy, setZipBulkBusy] = useState(false);

  const loadFolders = useCallback(async () => {
    const res = await fetch("/api/pm/employee-file-folders");
    const data = await res.json();
    if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load folders");
    const list = (data as { folders: PmEmployeeFilesFolder[] }).folders ?? [];
    setFolders(list);
    setRegionId((prev) => {
      if (list.length === 0) return "";
      if (list.some((f) => f.regionId === prev)) return prev;
      return list[0].regionId;
    });
  }, []);

  const loadFiles = useCallback(async (rid: string) => {
    if (!rid) {
      setFiles([]);
      return;
    }
    setFileLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pm/employee-files?regionId=${encodeURIComponent(rid)}`);
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to list files");
      setFiles((data as { files: FileRow[] }).files ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setFileLoading(false);
    }
  }, []);

  const loadBrowse = useCallback(async () => {
    if (!regionId) return;
    setBrowseLoading(true);
    try {
      if (browseAtRegionRoot) {
        const res = await fetch(
          `/api/pm/employee-files/browse?regionId=${encodeURIComponent(regionId)}&path=${encodeURIComponent(browsePath)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error((data as { message?: string }).message || "Browse failed");
        setBrowseFolders((data as { folders?: BrowseFolder[] }).folders ?? []);
        setBrowseFiles((data as { files?: BrowseFile[] }).files ?? []);
      } else if (browseEmployeeId) {
        const res = await fetch(
          `/api/pm/employee-files/browse?regionId=${encodeURIComponent(regionId)}&employeeId=${encodeURIComponent(browseEmployeeId)}&path=${encodeURIComponent(browsePath)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error((data as { message?: string }).message || "Browse failed");
        setBrowseFolders((data as { folders?: BrowseFolder[] }).folders ?? []);
        setBrowseFiles((data as { files?: BrowseFile[] }).files ?? []);
      } else {
        setBrowseFolders([]);
        setBrowseFiles([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Browse failed");
      setBrowseFolders([]);
      setBrowseFiles([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [regionId, browseAtRegionRoot, browseEmployeeId, browsePath]);

  const selectedFolder = folders.find((f) => f.regionId === regionId);
  const selectedRegionLabel = selectedFolder?.regionName ?? "—";
  const currentEmployeeLabel = assignees.find((a) => a.id === uploadEmployeeId)?.fullName ?? null;

  const uploadRelativeBase =
    !browseAtRegionRoot && browseEmployeeId && uploadEmployeeId === browseEmployeeId ? browsePath : "";
  const effectiveAdminUploadPath = adminUploadPathOverride.trim() || uploadRelativeBase;

  const uploadFlowBusy = uploadSession !== null && uploadSession.step === "upload" && uploadSession.busy;
  const pickerLocked = uploadBusy || uploadFlowBusy || uploadSession !== null;

  useEffect(() => {
    if (regionId) void loadFiles(regionId);
  }, [regionId, loadFiles]);

  useEffect(() => {
    setBrowseAtRegionRoot(true);
    setBrowseEmployeeId(null);
    setBrowsePath("");
    setMessage("");
    setError("");
    setSiteSearchResults([]);
    setSiteSearchTruncated(false);
    setSiteSearchError("");
    setSiteSearchHasRun(false);
  }, [regionId]);

  useEffect(() => {
    setAdminUploadPathOverride("");
  }, [browsePath, browseAtRegionRoot, browseEmployeeId, uploadEmployeeId]);

  useEffect(() => {
    if (!regionId || !selectedFolder) return;
    void loadBrowse();
  }, [regionId, selectedFolder, browseAtRegionRoot, browseEmployeeId, browsePath, loadBrowse]);

  useEffect(() => {
    if (!regionId) {
      setAssignees([]);
      setUploadEmployeeId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/pm/employee-files/region-employees?regionId=${encodeURIComponent(regionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error((data as { message?: string }).message || "Failed to load employees");
        const list = (data as { employees?: Assignee[] }).employees ?? [];
        if (!cancelled) {
          setAssignees(list);
          setUploadEmployeeId((prev) => (list.some((e) => e.id === prev) ? prev : list[0]?.id ?? ""));
        }
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regionId]);

  async function download(id: string) {
    setError("");
    const res = await fetch(`/api/pm/employee-files/${id}/download`);
    const data = await res.json();
    if (!res.ok) {
      setError((data as { message?: string }).message || "Download failed");
      return;
    }
    const u = (data as { downloadUrl?: string }).downloadUrl;
    if (u) globalThis.open(u, "_blank", "noopener,noreferrer");
  }

  function uploadDestinationLabel(): string {
    const emp =
      assignees.find((a) => a.id === uploadEmployeeId)?.fullName ?? (uploadEmployeeId ? "Employee" : "—");
    const path =
      effectiveAdminUploadPath.trim() ||
      uploadRelativeBase ||
      (uploadEmployeeId ? todayEmployeeSubpath() : "");
    return `${selectedRegionLabel} → ${emp} → ${path || "(default dated folder)"}`;
  }

  function closeUploadModal() {
    if (uploadSession?.step === "upload" && uploadSession.busy) return;
    uploadInFlightRef.current = false;
    setUploadSession(null);
  }

  async function runUploadFromModal() {
    if (uploadInFlightRef.current) return;
    if (!uploadSession || uploadSession.step !== "review" || uploadSession.items.length === 0) return;
    if (!regionId || !uploadEmployeeId) {
      setError("Select a region and employee.");
      return;
    }
    uploadInFlightRef.current = true;
    const { items, skipped, kind } = uploadSession;
    const rowsSnapshot = uploadSession.rows;
    setUploadSession({ ...uploadSession, step: "upload", busy: true, pageError: undefined });
    setError("");
    setMessage("");
    setUploadBusy(true);
    try {
      const defaultRel =
        kind === "files"
          ? effectiveAdminUploadPath.trim() || uploadRelativeBase.trim() || undefined
          : undefined;
      const result = await pmUploadFilesBatch(items, {
        regionId,
        employeeId: uploadEmployeeId,
        ...(defaultRel ? { defaultRelativePath: defaultRel } : {}),
        callbacks: {
          onFileStatus: (index, status, message) => {
            const nextStatus: UploadModalRow["status"] =
              status === "uploading" ? "uploading" : status === "done" ? "done" : "failed";
            setUploadSession((prev) => {
              if (!prev) return prev;
              const rows = prev.rows.map((r) =>
                r.id === String(index) ? { ...r, status: nextStatus, errorMessage: message } : r
              );
              return { ...prev, rows };
            });
          },
          onFileProgress: (index, loaded, total) => {
            setUploadSession((prev) => {
              if (!prev) return prev;
              const rows = prev.rows.map((r) =>
                r.id === String(index)
                  ? { ...r, bytesLoaded: loaded, bytesTotal: total > 0 ? total : r.bytesTotal }
                  : r
              );
              return { ...prev, rows };
            });
          },
        },
      });

      setMessage(
        `Uploaded ${result.uploaded} file(s).${skipped.length ? ` ${skipped.length} skipped before upload.` : ""}${result.failed.length ? ` ${result.failed.length} failed.` : ""}`
      );
      if (result.failed.length) {
        setError(result.failed.slice(0, 6).map((x) => `${x.name}: ${x.message}`).join(" · "));
      }

      setUploadSession((prev) =>
        prev
          ? {
              ...prev,
              step: "done",
              busy: false,
              rows: mergeFailedIntoRows(prev.rows, result.failed, rowsSnapshot),
              summary: {
                uploaded: result.uploaded,
                failed: result.failed.length,
                skipped: skipped.length,
              },
              pageError: result.failed.length
                ? result.failed
                    .slice(0, 4)
                    .map((x) => `${x.name}: ${x.message}`)
                    .join(" · ")
                : undefined,
            }
          : prev
      );

      if (regionId) await loadFiles(regionId);
      await loadBrowse();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      setUploadSession((prev) =>
        prev
          ? {
              ...prev,
              step: "done",
              busy: false,
              pageError: msg,
              summary: { uploaded: 0, failed: items.length, skipped: skipped.length },
            }
          : prev
      );
    } finally {
      uploadInFlightRef.current = false;
      setUploadBusy(false);
    }
  }

  function requestDeleteFile(fileId: string, label: string) {
    setPendingDeleteFile({ id: fileId, label });
  }

  async function executeDeleteFile() {
    const pending = pendingDeleteFile;
    if (!pending) return;
    setUploadBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/pm/employee-files/${pending.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message || "Delete failed");
      setPendingDeleteFile(null);
      setMessage("File deleted.");
      if (regionId) await loadFiles(regionId);
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function createEmployeeSubfolder() {
    if (browseAtRegionRoot || !uploadEmployeeId) {
      setError("Choose an employee from the list, then open their folder (click a name under Region) before creating a subfolder.");
      return;
    }
    const segment = sanitizeSubfolderName(adminNewSubfolder);
    if (!segment) {
      setError("Enter one folder name only (no slashes), e.g. Reports or Invoices.");
      return;
    }
    const relativePath = browsePath ? `${browsePath}/${segment}` : segment;
    setUploadBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pm/employee-files/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId,
          employeeId: uploadEmployeeId,
          relativePath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message || "Create folder failed");
      setMessage(`Folder “${segment}” created.`);
      setAdminNewSubfolder("");
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create folder failed");
    } finally {
      setUploadBusy(false);
    }
  }

  const breadcrumbParts = browsePath ? browsePath.split("/").filter(Boolean) : [];

  function enterEmployeeFromSlug(folderName: string) {
    const emp = assignees.find((a) => a.folderSlug === folderName);
    if (!emp) {
      setError("Could not match that folder to an employee in this region.");
      return;
    }
    setBrowseAtRegionRoot(false);
    setBrowseEmployeeId(emp.id);
    setUploadEmployeeId(emp.id);
    setBrowsePath("");
  }

  async function refreshWorkspace() {
    setFileLoading(true);
    try {
      await loadFolders();
      if (regionId) await loadFiles(regionId);
      await loadBrowse();
      setMessage("Refreshed.");
    } finally {
      setFileLoading(false);
    }
  }

  async function runSiteSearch() {
    if (!regionId || !selectedFolder) {
      setSiteSearchError("Select a region with storage first.");
      return;
    }
    const q = siteSearchQuery.trim();
    if (q.length < 2) {
      setSiteSearchError("Enter at least 2 characters (e.g. a Site ID folder name).");
      return;
    }
    setSiteSearchLoading(true);
    setSiteSearchError("");
    setSiteSearchHasRun(false);
    try {
      const res = await fetch(
        `/api/pm/employee-files/site-search?regionId=${encodeURIComponent(regionId)}&q=${encodeURIComponent(q)}`
      );
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        results?: SiteSearchHit[];
        truncated?: boolean;
      };
      if (!res.ok) throw new Error(data.message || "Search failed");
      setSiteSearchResults(data.results ?? []);
      setSiteSearchTruncated(!!data.truncated);
      setSiteSearchHasRun(true);
    } catch (e) {
      setSiteSearchError(e instanceof Error ? e.message : "Search failed");
      setSiteSearchResults([]);
      setSiteSearchTruncated(false);
      setSiteSearchHasRun(false);
    } finally {
      setSiteSearchLoading(false);
    }
  }

  const showEmployeeFolderZipUi = !browseAtRegionRoot && browseEmployeeId != null;

  useEffect(() => {
    setSelectedZipPaths([]);
  }, [regionId, browseEmployeeId, browsePath, browseAtRegionRoot]);

  function toggleZipFolderSelection(folderPath: string) {
    setSelectedZipPaths((prev) =>
      prev.includes(folderPath) ? prev.filter((p) => p !== folderPath) : [...prev, folderPath]
    );
  }

  function triggerSiteFolderZipDownload(siteFolderPath: string) {
    if (!regionId || !browseEmployeeId) return;
    const u = new URL("/api/pm/employee-files/site-folder-zip", window.location.origin);
    u.searchParams.set("regionId", regionId);
    u.searchParams.set("employeeId", browseEmployeeId);
    u.searchParams.set("sitePath", siteFolderPath);
    window.location.href = u.toString();
  }

  async function copySiteFolderDownloadLink(siteFolderPath: string) {
    if (!regionId || !browseEmployeeId) return;
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/pm/employee-files/site-folder-zip/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId,
          employeeId: browseEmployeeId,
          sitePath: siteFolderPath,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        url?: string;
        folderLabel?: string;
        zipFileName?: string;
      };
      if (!res.ok) throw new Error(data.message || "Could not create link");
      if (!data.url) throw new Error("Bad response");
      await navigator.clipboard.writeText(data.url);
      setMessage(
        `Download link copied. The URL includes “${data.folderLabel ?? "folder"}” so you can find it in chat search; download opens as ${data.zipFileName ?? "folder.zip"} (no portal login).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    }
  }

  async function downloadSelectedFoldersZip() {
    if (!regionId || !browseEmployeeId || selectedZipPaths.length === 0) return;
    setZipBulkBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/pm/employee-files/site-folder-zip-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regionId,
          employeeId: browseEmployeeId,
          paths: selectedZipPaths,
        }),
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
      setMessage(`Download started (${selectedZipPaths.length} folder${selectedZipPaths.length === 1 ? "" : "s"}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setZipBulkBusy(false);
    }
  }

  function openSiteSearchHit(hit: SiteSearchHit) {
    setBrowseAtRegionRoot(false);
    setBrowseEmployeeId(hit.employeeId);
    setUploadEmployeeId(hit.employeeId);
    setBrowsePath(hit.pathUnderEmployee);
    setMessage(`Opened: ${hit.employeeName} → ${hit.pathUnderEmployee}`);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}
      {message && !error ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-zinc-900">Manage employee files</h2>
          <p className="mt-1 text-xs text-zinc-600">
            Pick a region → browse employees and folders in Wasabi → upload or add folders for someone. Layout matches the
            portal: Region → employee → Month-Year → day → files.
          </p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Region</label>
              <select
                className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-900 shadow-sm"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
              >
                {folders.length === 0 ? (
                  <option value="">No employee-file storage in your PM regions yet</option>
                ) : null}
                {folders.map((f) => (
                  <option key={f.id} value={f.regionId}>
                    {f.regionName}
                    {f.regionCode ? ` (${f.regionCode})` : ""} — {f.pathSegment}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshWorkspace()}
                disabled={!regionId || !selectedFolder || fileLoading || browseLoading || pickerLocked}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Refresh lists
              </button>
            </div>
          </div>

          {regionId && selectedFolder ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-3 sm:px-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-indigo-900/80">
                Global search (site / folder name in region)
              </label>
              <p className="text-[11px] leading-relaxed text-zinc-600">
                Searches every active employee in this region for paths like{" "}
                <span className="font-mono">Month-Year / Day / … / Site ID</span>. The same Site ID can appear on different
                dates — each match is listed separately with employee and folder path. Results stay here while you open a
                row in the browser below.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  type="search"
                  className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm"
                  placeholder="e.g. ZJZ766"
                  value={siteSearchQuery}
                  onChange={(e) => setSiteSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSiteSearch();
                  }}
                  disabled={pickerLocked}
                />
                <button
                  type="button"
                  onClick={() => void runSiteSearch()}
                  disabled={pickerLocked || siteSearchLoading}
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
                >
                  {siteSearchLoading ? "Searching…" : "Search"}
                </button>
              </div>
              {siteSearchError ? <p className="mt-2 text-sm text-red-600">{siteSearchError}</p> : null}
              {siteSearchHasRun && !siteSearchLoading && !siteSearchError && siteSearchResults.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">
                  No matching folder names under any employee in this region. Empty site folders are included in the index;
                  try the exact Site ID spelling.
                </p>
              ) : null}
              {siteSearchResults.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-lg border border-white bg-white shadow-sm">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        <th className="px-3 py-2">Employee</th>
                        <th className="px-3 py-2">Matched folder</th>
                        <th className="px-3 py-2">Path under employee</th>
                        <th className="px-3 py-2">Objects</th>
                        <th className="px-3 py-2 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteSearchResults.map((hit) => (
                        <tr key={`${hit.employeeId}-${hit.pathUnderEmployee}`} className="border-b border-zinc-100 last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-medium text-zinc-900">{hit.employeeName}</span>
                            {hit.employeeEmail ? (
                              <span className="mt-0.5 block text-xs text-zinc-500">{hit.employeeEmail}</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-800">{hit.siteFolderName}</td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-[11px] leading-snug text-zinc-800 break-all">{hit.pathUnderEmployee}</div>
                            {hit.parentPathBeforeSite ? (
                              <div className="mt-1 text-[10px] text-zinc-500">
                                Date folders above site: <span className="font-mono">{hit.parentPathBeforeSite}</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-zinc-600">{hit.fileCountInSubtree}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => openSiteSearchHit(hit)}
                              disabled={pickerLocked}
                              className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
                            >
                              Open in browser
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {siteSearchTruncated ? (
                <p className="mt-2 text-xs text-amber-800">
                  Some employee trees were not fully scanned or the result cap was reached. Try a more specific Site ID, or
                  browse by employee.
                </p>
              ) : null}
            </div>
          ) : null}

          {!regionId || !selectedFolder ? (
            <p className="text-sm text-amber-800">
              No storage folder is configured for your regions yet, or none match your PM scope. Ask an administrator to
              enable employee file storage if needed.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-xs text-emerald-950 sm:text-sm">
                <span className="font-semibold">You are working in: </span>
                <span className="font-mono">{selectedRegionLabel}</span>
                {!browseAtRegionRoot && browseEmployeeId ? (
                  <>
                    {" → "}
                    <span className="font-medium">{currentEmployeeLabel ?? "Employee"}</span>
                    {browsePath ? (
                      <>
                        {" → "}
                        <span className="font-mono break-all">{browsePath}</span>
                      </>
                    ) : (
                      <span className="text-emerald-800"> (employee root)</span>
                    )}
                  </>
                ) : (
                  <span className="text-emerald-800"> — all employees in this region (click a folder to open someone)</span>
                )}
              </div>

              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">Storage browser</h3>
                  {!browseAtRegionRoot ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBrowseAtRegionRoot(true);
                        setBrowseEmployeeId(null);
                        setBrowsePath("");
                      }}
                      className="text-xs font-medium text-indigo-700 underline decoration-indigo-300 hover:text-indigo-900"
                    >
                      ← Back to all employees in region
                    </button>
                  ) : null}
                </div>

                <nav className="mt-2 flex flex-wrap items-center gap-1 text-xs text-zinc-600">
                  <button
                    type="button"
                    className="font-medium text-indigo-600 hover:underline"
                    onClick={() => {
                      setBrowseAtRegionRoot(true);
                      setBrowseEmployeeId(null);
                      setBrowsePath("");
                    }}
                  >
                    Region
                  </button>
                  {!browseAtRegionRoot && browseEmployeeId ? (
                    <>
                      <span className="text-zinc-400">/</span>
                      <button
                        type="button"
                        className="font-medium text-indigo-600 hover:underline"
                        onClick={() => setBrowsePath("")}
                      >
                        {currentEmployeeLabel ?? "Employee"}
                      </button>
                    </>
                  ) : null}
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

                {!browseAtRegionRoot && browseEmployeeId ? (
                  <button
                    type="button"
                    disabled={uploadBusy || pickerLocked}
                    onClick={() => setBrowsePath(todayEmployeeSubpath())}
                    className="mt-2 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Jump to today&apos;s date folder
                  </button>
                ) : null}

                {showEmployeeFolderZipUi && selectedZipPaths.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-950">
                    <span className="font-medium">
                      {selectedZipPaths.length} folder{selectedZipPaths.length === 1 ? "" : "s"} selected for ZIP
                    </span>
                    <button
                      type="button"
                      disabled={zipBulkBusy || pickerLocked}
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

                {browseLoading ? (
                  <p className="mt-3 text-sm text-zinc-500">Loading…</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-white bg-white">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          {showEmployeeFolderZipUi ? (
                            <th className="w-10 px-2 py-2 text-center font-medium text-zinc-800">
                              <span className="sr-only">Include in multi-folder ZIP</span>
                            </th>
                          ) : null}
                          <th className="px-3 py-2 text-left font-medium text-zinc-800">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-zinc-800">Size</th>
                          <th className="px-3 py-2 text-right font-medium text-zinc-800">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {browseFolders.map((f) => (
                          <tr key={`folder-${f.path}`} className="border-b border-zinc-100">
                            {showEmployeeFolderZipUi ? (
                              <td
                                className="w-10 px-2 py-2 text-center align-middle"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                  checked={selectedZipPaths.includes(f.path)}
                                  disabled={pickerLocked}
                                  title="Include in multi-folder ZIP download"
                                  aria-label={`Include folder ${f.name} in ZIP bundle`}
                                  onChange={() => toggleZipFolderSelection(f.path)}
                                />
                              </td>
                            ) : null}
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="font-medium text-indigo-600 hover:underline"
                                onClick={() =>
                                  browseAtRegionRoot ? enterEmployeeFromSlug(f.name) : setBrowsePath(f.path)
                                }
                              >
                                {f.name}/
                              </button>
                            </td>
                            <td className="px-3 py-2 text-zinc-500">—</td>
                            <td className="px-3 py-2 text-right">
                              {showEmployeeFolderZipUi ? (
                                <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs">
                                  <button
                                    type="button"
                                    disabled={pickerLocked}
                                    onClick={() => triggerSiteFolderZipDownload(f.path)}
                                    className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
                                  >
                                    Download zip
                                  </button>
                                  <span className="text-zinc-300">|</span>
                                  <button
                                    type="button"
                                    disabled={pickerLocked}
                                    onClick={() => void copySiteFolderDownloadLink(f.path)}
                                    className="font-medium text-indigo-600 hover:underline disabled:opacity-50"
                                  >
                                    Copy download link
                                  </button>
                                </span>
                              ) : (
                                <span className="text-zinc-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {browseFiles.map((f) => (
                          <tr key={f.key} className="border-b border-zinc-100">
                            {showEmployeeFolderZipUi ? <td className="w-10 px-2 py-2" aria-hidden /> : null}
                            <td className="px-3 py-2 font-medium text-zinc-900">{f.name}</td>
                            <td className="px-3 py-2 text-zinc-600">{formatBytes(f.size)}</td>
                            <td className="px-3 py-2 text-right">
                              {f.db?.id && f.db.upload_status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() => download(f.db!.id)}
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
                                    onClick={() => requestDeleteFile(f.db!.id, f.name || f.db!.file_name)}
                                    disabled={uploadBusy}
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
                            <td
                              colSpan={showEmployeeFolderZipUi ? 4 : 3}
                              className="px-3 py-6 text-center text-zinc-500"
                            >
                              {browseAtRegionRoot
                                ? "No employee folders yet. When someone uploads, their folder appears here."
                                : "This folder is empty."}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
                <h3 className="text-sm font-semibold text-zinc-900">Upload & new folder</h3>
                <p className="mt-1 text-xs text-zinc-600">
                  Files go into the <strong>green path</strong> when the selected employee matches the one you are browsing.
                  Otherwise pick the employee below — uploads use today&apos;s date folders automatically if no path is set.
                </p>

                <p className="mt-2 rounded-md border border-zinc-200 bg-zinc-100/80 px-3 py-2 text-[11px] text-zinc-700">
                  <span className="font-medium text-zinc-900">Allowed types:</span> {EMPLOYEE_UPLOAD_ALLOWED_EXTENSIONS_HELP}
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-zinc-700">Employee you are helping</label>
                    <select
                      className="w-full max-w-lg rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      value={uploadEmployeeId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUploadEmployeeId(v);
                        setBrowseEmployeeId(v);
                        setBrowseAtRegionRoot(false);
                        setBrowsePath("");
                      }}
                      disabled={uploadBusy || assignees.length === 0 || pickerLocked}
                    >
                      {assignees.length === 0 ? <option value="">No active employees in this region</option> : null}
                      {assignees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.fullName}
                          {e.email ? ` — ${e.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={pickerLocked || !uploadEmployeeId}
                    onChange={(e) => {
                      if (!regionId || !uploadEmployeeId) {
                        setError("Select a region and employee.");
                        return;
                      }
                      const picked = e.target.files ? Array.from(e.target.files) : [];
                      e.target.value = "";
                      if (!picked.length) return;
                      const raw = picked.map((f) => ({ file: f }));
                      const { allowed, skipped } = filterEmployeeUploadItems(raw);
                      const pathLabel =
                        effectiveAdminUploadPath.trim() ||
                        uploadRelativeBase.trim() ||
                        (uploadEmployeeId ? todayEmployeeSubpath() : "");
                      const rows = buildAdminUploadRows(allowed, "files", pathLabel);
                      setUploadSession({
                        step: "review",
                        kind: "files",
                        items: allowed,
                        skipped,
                        rows,
                        busy: false,
                      });
                    }}
                  />
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    disabled={pickerLocked || !uploadEmployeeId}
                    {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(e) => {
                      if (!regionId || !uploadEmployeeId) {
                        setError("Select a region and employee.");
                        return;
                      }
                      const picked = e.target.files ? Array.from(e.target.files) : [];
                      e.target.value = "";
                      if (!picked.length) return;
                      const base = effectiveAdminUploadPath.trim() || uploadRelativeBase;
                      const items = buildFolderUploadItemsAdmin(picked, base);
                      const { allowed, skipped } = filterEmployeeUploadItems(items);
                      const pathLabel =
                        effectiveAdminUploadPath.trim() ||
                        uploadRelativeBase.trim() ||
                        (uploadEmployeeId ? todayEmployeeSubpath() : "");
                      const rows = buildAdminUploadRows(allowed, "folder", pathLabel);
                      setUploadSession({
                        step: "review",
                        kind: "folder",
                        folderName: folderLabelFromPickedFiles(picked),
                        items: allowed,
                        skipped,
                        rows,
                        busy: false,
                      });
                    }}
                  />

                  <div>
                    <span className="mb-1 block text-xs font-medium text-zinc-700">Files</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={pickerLocked || !uploadEmployeeId}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Choose files
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Pick files, then confirm in the dialog (fixes empty selection after upload).
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-zinc-700">Folder from disk</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={pickerLocked || !uploadEmployeeId}
                        onClick={() => folderInputRef.current?.click()}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Choose folder
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Browser may ask to confirm folder upload; then confirm in the dialog.
                      </span>
                    </div>
                  </div>
                </div>

                <details className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-700">Advanced: override upload path</summary>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Leave empty to use the browser path (green bar) when it matches the selected employee, or today&apos;s
                    dated folder when at employee root.
                  </p>
                  <input
                    type="text"
                    className="mt-2 w-full max-w-lg rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="e.g. Apr-2026/28-Apr-2026/Reports"
                    disabled={uploadBusy || pickerLocked}
                    value={adminUploadPathOverride}
                    onChange={(e) => setAdminUploadPathOverride(e.target.value)}
                  />
                </details>

                <div className="mt-4 border-t border-zinc-200 pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New subfolder (inside green path)</h4>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    One name only, no slashes — created under the folder you have open for that employee (same as employee
                    portal).
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <input
                      type="text"
                      value={adminNewSubfolder}
                      onChange={(e) => setAdminNewSubfolder(e.target.value)}
                      placeholder="e.g. Reports"
                      disabled={uploadBusy || browseAtRegionRoot || !uploadEmployeeId || pickerLocked}
                      className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void createEmployeeSubfolder()}
                      disabled={uploadBusy || browseAtRegionRoot || !uploadEmployeeId || pickerLocked}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Create folder
                    </button>
                  </div>
                  {browseAtRegionRoot ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Open an employee first: click a name in the table above, or choose someone in the dropdown and use
                      &quot;Jump to today&apos;s date folder&quot; to enter their tree.
                    </p>
                  ) : null}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">All files in this region (searchable list)</h3>
                {fileLoading ? (
                  <p className="text-sm text-zinc-500">Loading…</p>
                ) : files.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                    No file records for this region yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-zinc-200">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                          <th className="px-3 py-2.5">File</th>
                          <th className="px-3 py-2.5">Employee</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5">Size</th>
                          <th className="px-3 py-2.5">Uploaded</th>
                          <th className="px-3 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((f) => (
                          <tr key={f.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
                            <td className="px-3 py-2.5 font-medium text-zinc-900">{f.fileName}</td>
                            <td className="px-3 py-2.5 text-zinc-700">
                              {f.employeeName}
                              {f.employeeEmail ? (
                                <span className="mt-0.5 block text-xs text-zinc-500">{f.employeeEmail}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-600 capitalize">
                              {(f.uploadStatus ?? "").replace(/_/g, " ") || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-600">{formatBytes(f.byteSize)}</td>
                            <td className="px-3 py-2.5 text-zinc-600">{new Date(f.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              {f.uploadStatus === "active" ? (
                                <button
                                  type="button"
                                  onClick={() => download(f.id)}
                                  className="font-medium text-indigo-600 hover:underline"
                                >
                                  Download
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                              {" · "}
                              <button
                                type="button"
                                onClick={() => requestDeleteFile(f.id, f.fileName)}
                                disabled={uploadBusy}
                                className="font-medium text-rose-600 hover:underline disabled:opacity-50"
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
            </>
          )}
        </div>
      </div>

      {uploadSession ? (
        <AdminUploadModal
          open
          step={uploadSession.step}
          kind={uploadSession.kind}
          folderName={uploadSession.folderName}
          employeeLabel={(() => {
            const e = assignees.find((a) => a.id === uploadEmployeeId);
            return e ? `${e.fullName}${e.email ? ` (${e.email})` : ""}` : undefined;
          })()}
          targetLocationLabel={uploadDestinationLabel()}
          skipped={uploadSession.skipped}
          rows={uploadSession.rows}
          busy={uploadSession.busy}
          overallPercent={overallUploadPercent(uploadSession.rows)}
          summary={uploadSession.summary}
          pageError={uploadSession.pageError}
          onClose={closeUploadModal}
          onStartUpload={() => void runUploadFromModal()}
        />
      ) : null}

      <ConfirmModal
        open={!!pendingDeleteFile}
        title="Delete this file?"
        message={
          pendingDeleteFile
            ? `Delete “${pendingDeleteFile.label}”? This removes the file from storage and cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={uploadBusy && !!pendingDeleteFile}
        panelClassName="max-w-md"
        onCancel={() => !uploadBusy && setPendingDeleteFile(null)}
        onConfirm={() => void executeDeleteFile()}
      />
    </div>
  );
}
