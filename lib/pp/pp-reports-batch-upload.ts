import { runPool } from "@/lib/employee-files/concurrency-pool";
import { browserUploadPpReportMultipart, fileRequiresMultipartUpload } from "@/lib/wasabi/browser-multipart-upload";

const PRESIGN_MAX = 100;
const DEFAULT_PUT_CONCURRENCY = 8;

type PresignUploadRow = {
  index: number;
  uploadUrl: string;
  fileName: string;
  headers?: { "Content-Type"?: string };
};

export type PpReportsUploadItem = { file: File; relativePath?: string };

type Callbacks = {
  onFileStatus?: (index: number, status: "uploading" | "done" | "failed", message?: string) => void;
  onFileProgress?: (index: number, loaded: number, total: number) => void;
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

async function uploadOneMultipart(
  entry: BatchEntry,
  defaultRelativePath: string | undefined,
  cb: Callbacks | undefined
): Promise<{ ok: true } | { ok: false; name: string; message: string }> {
  const { file, relativePath, index } = entry;
  cb?.onFileStatus?.(index, "uploading");
  cb?.onFileProgress?.(index, 0, file.size);
  try {
    await browserUploadPpReportMultipart({
      file,
      defaultRelativePath: defaultRelativePath ?? null,
      relativePath: relativePath ?? null,
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

async function flushSmallBatch(
  batch: BatchEntry[],
  defaultRelativePath: string | undefined,
  putConcurrency: number,
  cb: Callbacks | undefined
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const failed: { name: string; message: string }[] = [];
  if (batch.length === 0) return { uploaded: 0, failed };

  const slice = batch;
  const def = defaultRelativePath?.trim();

  const pres = await fetch("/api/pp/reports/presign-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      defaultRelativePath: def || null,
      items: slice.map(({ file, relativePath: rp }) => {
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
        const r = (rp?.trim() || "").trim();
        if (r) row.relativePath = r;
        return row;
      }),
    }),
  });
  const pr = await pres.json().catch(() => ({}));
  if (!pres.ok) {
    for (const entry of slice) {
      failed.push({ name: entry.file.name, message: (pr as { message?: string }).message || "Presign failed" });
      cb?.onFileStatus?.(entry.index, "failed", (pr as { message?: string }).message || "Presign failed");
    }
    return { uploaded: 0, failed };
  }

  const uploads = ((pr as { uploads?: PresignUploadRow[] }).uploads ?? []).slice().sort((a, b) => a.index - b.index);

  const putResults = await runPool(uploads, putConcurrency, async (u) => {
    const entry = slice[u.index];
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
      return { ok: true as const, index: globalIndex, name: file.name };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      cb?.onFileStatus?.(globalIndex, "failed", message);
      return { ok: false as const, name: file.name, message, index: globalIndex };
    }
  });

  let uploaded = 0;
  for (const r of putResults) {
    if (!r.ok) failed.push({ name: r.name, message: r.message });
    else {
      uploaded += 1;
      cb?.onFileStatus?.(r.index, "done");
    }
  }
  return { uploaded, failed };
}

export async function ppReportsUploadFilesBatch(
  items: PpReportsUploadItem[],
  options: {
    defaultRelativePath?: string;
    putConcurrency?: number;
    callbacks?: Callbacks;
  }
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const failed: { name: string; message: string }[] = [];
  const cb = options.callbacks;
  if (items.length === 0) return { uploaded: 0, failed };

  const putConcurrency = options.putConcurrency ?? DEFAULT_PUT_CONCURRENCY;
  const def = options.defaultRelativePath?.trim();

  let uploaded = 0;
  let batch: BatchEntry[] = [];

  const flushBatch = async () => {
    const r = await flushSmallBatch(batch, def, putConcurrency, cb);
    uploaded += r.uploaded;
    failed.push(...r.failed);
    batch = [];
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const entry: BatchEntry = { file: it.file, relativePath: it.relativePath, index: i };
    if (fileRequiresMultipartUpload(it.file.size)) {
      await flushBatch();
      const mr = await uploadOneMultipart(entry, def, cb);
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
