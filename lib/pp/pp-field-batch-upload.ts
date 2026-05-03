import { runPool } from "@/lib/employee-files/concurrency-pool";

const PRESIGN_MAX = 100;
const DEFAULT_PUT_CONCURRENCY = 8;

type PresignItem = {
  index: number;
  id: string;
  uploadUrl: string;
  fileName: string;
  headers?: { "Content-Type"?: string };
};

export type PpFieldUploadItem = { file: File; relativePath?: string };

type Callbacks = {
  onFileStatus?: (index: number, status: "uploading" | "done" | "failed", message?: string) => void;
  onFileProgress?: (index: number, loaded: number, total: number) => void;
};

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
    const res = await fetch("/api/pp/field-files/complete-batch", {
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

export async function ppFieldUploadFilesBatch(
  items: PpFieldUploadItem[],
  options: {
    regionId: string;
    employeeId: string;
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

  for (let offset = 0; offset < items.length; offset += PRESIGN_MAX) {
    const slice = items.slice(offset, offset + PRESIGN_MAX);
    const pres = await fetch("/api/pp/field-files/presign-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regionId: options.regionId,
        employeeId: options.employeeId,
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
          const r = (rp?.trim() || def || "").trim();
          if (r) row.relativePath = r;
          return row;
        }),
      }),
    });
    const pr = await pres.json().catch(() => ({}));
    if (!pres.ok) {
      for (let i = 0; i < slice.length; i++) {
        const idx = offset + i;
        const { file } = slice[i]!;
        failed.push({ name: file.name, message: (pr as { message?: string }).message || "Presign failed" });
        cb?.onFileStatus?.(idx, "failed", (pr as { message?: string }).message || "Presign failed");
      }
      continue;
    }

    const uploads = ((pr as { uploads?: PresignItem[] }).uploads ?? []).slice().sort((a, b) => a.index - b.index);

    const putResults = await runPool(uploads, putConcurrency, async (u) => {
      const globalIndex = offset + u.index;
      const entry = slice[u.index];
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
        failed.push({ name: `(after ${slice[0]?.file.name ?? "upload"})`, message });
        for (const s of successes) {
          cb?.onFileStatus?.(s.index, "failed", message);
        }
      }
    }
  }

  return { uploaded, failed };
}
