import { multipartPartCount, multipartPartSizeBytesForFile, S3_SINGLE_PUT_MAX_BYTES } from "@/lib/wasabi/s3-multipart-constants";
import { runPool } from "@/lib/employee-files/concurrency-pool";

const DEFAULT_PART_URL_BATCH = 20;
const DEFAULT_PART_PUT_CONCURRENCY = 6;

function putPartBlob(url: string, blob: Blob, onPartProgress: (loaded: number, total: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (ev) => {
      const total = ev.lengthComputable ? ev.total : blob.size;
      onPartProgress(ev.loaded, total > 0 ? total : blob.size);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) reject(new Error("Storage did not return ETag for part"));
        else resolve(etag);
      } else reject(new Error(`Part upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during part upload"));
    xhr.send(blob);
  });
}

export function fileRequiresMultipartUpload(byteSize: number): boolean {
  return byteSize > S3_SINGLE_PUT_MAX_BYTES;
}

export type PpMultipartPartUrlRow = { partNumber: number; uploadUrl: string };

/**
 * PP reports bucket: init + part URLs + complete are separate authenticated routes.
 * @param apiBase — `/api/pp/reports` (reporter) or `/api/pm/pp-reports` (PM browse path).
 */
export async function browserUploadPpReportMultipart(args: {
  file: File;
  apiBase?: string;
  defaultRelativePath?: string | null;
  relativePath?: string | null;
  partUrlBatchSize?: number;
  partPutConcurrency?: number;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void> {
  const apiBase = (args.apiBase ?? "/api/pp/reports").replace(/\/$/, "");
  const { file, defaultRelativePath, relativePath, onProgress } = args;
  const partUrlBatch = args.partUrlBatchSize ?? DEFAULT_PART_URL_BATCH;
  const partConcurrency = args.partPutConcurrency ?? DEFAULT_PART_PUT_CONCURRENCY;
  const total = file.size;
  if (!fileRequiresMultipartUpload(total)) {
    throw new Error("browserUploadPpReportMultipart: file is below multipart threshold");
  }

  const partSizeBytes = multipartPartSizeBytesForFile(total);
  const partCount = multipartPartCount(total, partSizeBytes);

  const initRes = await fetch(`${apiBase}/multipart-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      byteSize: total,
      defaultRelativePath: defaultRelativePath ?? null,
      relativePath: relativePath ?? null,
    }),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    throw new Error(typeof (initJson as { message?: string }).message === "string" ? (initJson as { message: string }).message : "Multipart init failed");
  }
  const uploadId = String((initJson as { uploadId?: string }).uploadId ?? "");
  const storageKey = String((initJson as { storageKey?: string }).storageKey ?? "");
  const serverPartSize = (initJson as { partSizeBytes?: number }).partSizeBytes;
  if (!uploadId || !storageKey || typeof serverPartSize !== "number") {
    throw new Error("Multipart init returned invalid payload");
  }
  if (serverPartSize !== partSizeBytes) {
    throw new Error("Multipart part size mismatch (client/server)");
  }

  const etags: { PartNumber: number; ETag: string }[] = [];
  let completedBytes = 0;
  const partProgressBase = new Map<number, number>();

  const reportOverall = () => {
    let sum = completedBytes;
    for (const v of partProgressBase.values()) sum += v;
    onProgress?.(Math.min(sum, total), total);
  };

  for (let batchStart = 1; batchStart <= partCount; batchStart += partUrlBatch) {
    const batchEnd = Math.min(batchStart + partUrlBatch - 1, partCount);
    const partNumbers: number[] = [];
    for (let p = batchStart; p <= batchEnd; p++) partNumbers.push(p);

    const urlRes = await fetch(`${apiBase}/multipart-part-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storageKey, uploadId, partNumbers }),
    });
    const urlJson = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok) {
      throw new Error(
        typeof (urlJson as { message?: string }).message === "string" ? (urlJson as { message: string }).message : "Part URL request failed"
      );
    }
    const rows = (urlJson as { parts?: PpMultipartPartUrlRow[] }).parts ?? [];
    const byPart = new Map(rows.map((r) => [r.partNumber, r.uploadUrl] as const));

    const putOne = async (partNumber: number) => {
      const uploadUrl = byPart.get(partNumber);
      if (!uploadUrl) throw new Error(`Missing presigned URL for part ${partNumber}`);
      const start = (partNumber - 1) * partSizeBytes;
      const end = Math.min(start + partSizeBytes, total);
      const blob = file.slice(start, end);
      partProgressBase.set(partNumber, 0);
      const etag = await putPartBlob(uploadUrl, blob, (loaded) => {
        partProgressBase.set(partNumber, loaded);
        reportOverall();
      });
      partProgressBase.delete(partNumber);
      completedBytes += blob.size;
      reportOverall();
      return { PartNumber: partNumber, ETag: etag };
    };

    const batchResults = await runPool(partNumbers, partConcurrency, putOne);
    for (const r of batchResults.sort((a, b) => a.PartNumber - b.PartNumber)) {
      etags.push(r);
    }
  }

  const completeRes = await fetch(`${apiBase}/multipart-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storageKey, uploadId, parts: etags }),
  });
  const completeJson = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    throw new Error(
      typeof (completeJson as { message?: string }).message === "string" ? (completeJson as { message: string }).message : "Multipart complete failed"
    );
  }
  onProgress?.(total, total);
}

export type EmployeeMultipartPartUrlRow = { partNumber: number; uploadUrl: string };

export async function browserUploadEmployeePersonalMultipart(args: {
  apiBase: string;
  file: File;
  id: string;
  partSizeBytes: number;
  partCount: number;
  /** Merged into multipart-part-urls and multipart-complete JSON (e.g. regionId + employeeId for PM / PP field). */
  partAndCompleteExtra?: Record<string, unknown>;
  partUrlBatchSize?: number;
  partPutConcurrency?: number;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void> {
  const { apiBase, file, id, partSizeBytes, partCount, onProgress, partAndCompleteExtra } = args;
  const extra = partAndCompleteExtra ?? {};
  const partUrlBatch = args.partUrlBatchSize ?? DEFAULT_PART_URL_BATCH;
  const partConcurrency = args.partPutConcurrency ?? DEFAULT_PART_PUT_CONCURRENCY;
  const total = file.size;

  const etags: { PartNumber: number; ETag: string }[] = [];
  let completedBytes = 0;
  const partProgressBase = new Map<number, number>();

  const reportOverall = () => {
    let sum = completedBytes;
    for (const v of partProgressBase.values()) sum += v;
    onProgress?.(Math.min(sum, total), total);
  };

  for (let batchStart = 1; batchStart <= partCount; batchStart += partUrlBatch) {
    const batchEnd = Math.min(batchStart + partUrlBatch - 1, partCount);
    const partNumbers: number[] = [];
    for (let p = batchStart; p <= batchEnd; p++) partNumbers.push(p);

    const urlRes = await fetch(`${apiBase}/multipart-part-urls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extra, id, partNumbers }),
    });
    const urlJson = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok) {
      throw new Error(
        typeof (urlJson as { message?: string }).message === "string" ? (urlJson as { message: string }).message : "Part URL request failed"
      );
    }
    const rows = (urlJson as { parts?: EmployeeMultipartPartUrlRow[] }).parts ?? [];
    const byPart = new Map(rows.map((r) => [r.partNumber, r.uploadUrl] as const));

    const putOne = async (partNumber: number) => {
      const uploadUrl = byPart.get(partNumber);
      if (!uploadUrl) throw new Error(`Missing presigned URL for part ${partNumber}`);
      const start = (partNumber - 1) * partSizeBytes;
      const end = Math.min(start + partSizeBytes, total);
      const blob = file.slice(start, end);
      partProgressBase.set(partNumber, 0);
      const etag = await putPartBlob(uploadUrl, blob, (loaded) => {
        partProgressBase.set(partNumber, loaded);
        reportOverall();
      });
      partProgressBase.delete(partNumber);
      completedBytes += blob.size;
      reportOverall();
      return { PartNumber: partNumber, ETag: etag };
    };

    const batchResults = await runPool(partNumbers, partConcurrency, putOne);
    for (const r of batchResults.sort((a, b) => a.PartNumber - b.PartNumber)) {
      etags.push(r);
    }
  }

  const completeRes = await fetch(`${apiBase}/multipart-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...extra, id, parts: etags }),
  });
  const completeJson = await completeRes.json().catch(() => ({}));
  if (!completeRes.ok) {
    throw new Error(
      typeof (completeJson as { message?: string }).message === "string" ? (completeJson as { message: string }).message : "Multipart complete failed"
    );
  }
  onProgress?.(total, total);
}

/**
 * One-shot: multipart-init then part uploads and complete (employee / PM / PP field personal files).
 */
export async function employeePersonalMultipartFullUpload(args: {
  apiBase: string;
  file: File;
  /** Fields for multipart-init excluding fileName, contentType, byteSize (added from `file`). */
  initPayload: Record<string, unknown>;
  partAndCompleteExtra?: Record<string, unknown>;
  partUrlBatchSize?: number;
  partPutConcurrency?: number;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void> {
  const { apiBase, file, initPayload, partAndCompleteExtra, onProgress } = args;
  const initRes = await fetch(`${apiBase}/multipart-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...initPayload,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      byteSize: file.size,
    }),
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    throw new Error(
      typeof (initJson as { message?: string }).message === "string" ? (initJson as { message: string }).message : "Multipart init failed"
    );
  }
  const id = String((initJson as { id?: string }).id ?? "");
  const partSizeBytes = (initJson as { partSizeBytes?: number }).partSizeBytes;
  const partCount = (initJson as { partCount?: number }).partCount;
  if (!id || typeof partSizeBytes !== "number" || typeof partCount !== "number") {
    throw new Error("Multipart init returned invalid payload");
  }
  await browserUploadEmployeePersonalMultipart({
    apiBase,
    file,
    id,
    partSizeBytes,
    partCount,
    partAndCompleteExtra,
    partUrlBatchSize: args.partUrlBatchSize,
    partPutConcurrency: args.partPutConcurrency,
    onProgress,
  });
}
