import { runPool } from "@/lib/employee-files/concurrency-pool";
import { employeePersonalMultipartFullUpload, fileRequiresMultipartUpload } from "@/lib/wasabi/browser-multipart-upload";

const PRESIGN_MAX = 100;
const DEFAULT_PUT_CONCURRENCY = 8;

const API_BASE = "/api/employee-files";

type PresignItem = {
  index: number;
  id: string;
  uploadUrl: string;
  fileName: string;
  headers?: { "Content-Type"?: string };
};

export type EmployeeUploadItem = { file: File; relativePath?: string };

export type EmployeeUploadBatchCallbacks = {
  /** Global index into the original `items` array (0 .. length-1). */
  onFileStatus?: (index: number, status: "uploading" | "done" | "failed", message?: string) => void;
  onFileProgress?: (index: number, loaded: number, total: number) => void;
  /** Called before presign request for a slice. */
  onSlicePresign?: (startIndex: number, count: number) => void;
};

type BatchEntry = { file: File; relativePath?: string; index: number };

function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      const total = ev.lengthComputable ? ev.total : file.size;
      onProgress(ev.loaded, total > 0 ? total : file.size);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage returned ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

async function postCompleteBatch(ids: string[]) {
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const res = await fetch(`${API_BASE}/complete-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: slice }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof (data as { message?: string }).message === "string"
          ? (data as { message: string }).message
          : "Complete batch failed"
      );
    }
  }
}

async function flushSmallBatch(
  batch: BatchEntry[],
  def: string | undefined,
  putConcurrency: number,
  cb: EmployeeUploadBatchCallbacks | undefined,
  uploadDate: string | undefined
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const failed: { name: string; message: string }[] = [];
  if (batch.length === 0) return { uploaded: 0, failed };

  cb?.onSlicePresign?.(batch[0]!.index, batch.length);

  const pres = await fetch(`${API_BASE}/presign-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(uploadDate ? { uploadDate } : {}),
      items: batch.map(({ file, relativePath: rp }) => {
        const row: {
          fileName: string;
          contentType: string;
          byteSize: number;
          relativePath?: string;
        } = {
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          byteSize: file.size,
        };
        const r = (rp?.trim() || def || "").trim();
        if (r) row.relativePath = r;
        return row;
      }),
    }),
  });
  const pr = await pres.json().catch(() => ({}));
  if (!pres.ok) {
    for (const entry of batch) {
      failed.push({ name: entry.file.name, message: (pr as { message?: string }).message || "Presign failed" });
      cb?.onFileStatus?.(entry.index, "failed", (pr as { message?: string }).message || "Presign failed");
    }
    return { uploaded: 0, failed };
  }

  const uploads = ((pr as { uploads?: PresignItem[] }).uploads ?? []).slice().sort((a, b) => a.index - b.index);

  const putResults = await runPool(uploads, putConcurrency, async (u) => {
    const entry = batch[u.index];
    const globalIndex = entry?.index ?? u.index;
    const file = entry?.file;
    if (!file?.size) {
      cb?.onFileStatus?.(globalIndex, "failed", "Empty file");
      return { ok: false as const, name: u.fileName, message: "Empty file", index: globalIndex };
    }
    const contentType = u.headers?.["Content-Type"] || file.type || "application/octet-stream";
    cb?.onFileStatus?.(globalIndex, "uploading");
    cb?.onFileProgress?.(globalIndex, 0, file.size);
    try {
      await putFileWithProgress(u.uploadUrl, file, contentType, (loaded, total) => {
        cb?.onFileProgress?.(globalIndex, loaded, total);
      });
      cb?.onFileProgress?.(globalIndex, file.size, file.size);
      return { ok: true as const, id: u.id, index: globalIndex, name: file.name };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      cb?.onFileStatus?.(globalIndex, "failed", message);
      return { ok: false as const, name: file.name, message, index: globalIndex };
    }
  });

  let uploaded = 0;
  const successes = putResults.filter((r): r is { ok: true; id: string; index: number; name: string } => r.ok === true);
  for (const r of putResults) {
    if (!r.ok) failed.push({ name: r.name, message: r.message });
  }

  if (successes.length) {
    try {
      await postCompleteBatch(successes.map((s) => s.id));
      uploaded += successes.length;
      for (const s of successes) {
        cb?.onFileStatus?.(s.index, "done");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Complete failed";
      failed.push({ name: `(after ${batch[0]?.file.name ?? "upload"})`, message });
      for (const s of successes) {
        cb?.onFileStatus?.(s.index, "failed", message);
      }
    }
  }
  return { uploaded, failed };
}

async function uploadOneEmployeeMultipart(
  entry: BatchEntry,
  def: string | undefined,
  uploadDate: string | undefined,
  cb: EmployeeUploadBatchCallbacks | undefined
): Promise<{ ok: true } | { ok: false; name: string; message: string }> {
  const { file, relativePath, index } = entry;
  const r = (relativePath?.trim() || def || "").trim();
  const initPayload: Record<string, unknown> = {};
  if (r) initPayload.relativePath = r;
  if (uploadDate) initPayload.uploadDate = uploadDate;

  cb?.onFileStatus?.(index, "uploading");
  cb?.onFileProgress?.(index, 0, file.size);
  try {
    await employeePersonalMultipartFullUpload({
      apiBase: API_BASE,
      file,
      initPayload,
      onProgress: (loaded, total) => cb?.onFileProgress?.(index, loaded, total),
    });
    cb?.onFileProgress?.(index, file.size, file.size);
    cb?.onFileStatus?.(index, "done");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    cb?.onFileStatus?.(index, "failed", message);
    return { ok: false, name: file.name, message };
  }
}

/**
 * Presign many files in one API call, PUT to Wasabi with bounded concurrency, then complete in one (or chunked) call.
 * Files larger than 5 GiB use S3 multipart automatically.
 */
export async function employeeUploadFilesBatch(
  items: EmployeeUploadItem[],
  options?: {
    defaultRelativePath?: string;
    /** Passed to presign-batch / multipart-init when set (ISO date string). */
    uploadDate?: string;
    putConcurrency?: number;
    callbacks?: EmployeeUploadBatchCallbacks;
  }
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const failed: { name: string; message: string }[] = [];
  const cb = options?.callbacks;
  if (items.length === 0) return { uploaded: 0, failed };

  const putConcurrency = options?.putConcurrency ?? DEFAULT_PUT_CONCURRENCY;
  const def = options?.defaultRelativePath?.trim();
  const uploadDate = options?.uploadDate;

  let uploaded = 0;
  let batch: BatchEntry[] = [];

  const flushBatch = async () => {
    const r = await flushSmallBatch(batch, def, putConcurrency, cb, uploadDate);
    uploaded += r.uploaded;
    failed.push(...r.failed);
    batch = [];
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const entry: BatchEntry = { file: it.file, relativePath: it.relativePath, index: i };
    if (fileRequiresMultipartUpload(it.file.size)) {
      await flushBatch();
      const mr = await uploadOneEmployeeMultipart(entry, def, uploadDate, cb);
      if (!mr.ok) failed.push({ name: mr.name, message: mr.message });
      else uploaded += 1;
    } else {
      batch.push(entry);
      if (batch.length >= PRESIGN_MAX) {
        await flushBatch();
      }
    }
  }
  await flushBatch();

  return { uploaded, failed };
}
