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

export type EmployeeUploadItem = { file: File; relativePath?: string };

async function postCompleteBatch(ids: string[]) {
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const res = await fetch("/api/employee-files/complete-batch", {
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

/**
 * Presign many files in one API call, PUT to Wasabi with bounded concurrency, then complete in one (or chunked) call.
 * Each item may set `relativePath` (under employee); otherwise `defaultRelativePath` is used when set.
 */
export async function employeeUploadFilesBatch(
  items: EmployeeUploadItem[],
  options?: { defaultRelativePath?: string; putConcurrency?: number }
): Promise<{ uploaded: number; failed: { name: string; message: string }[] }> {
  const failed: { name: string; message: string }[] = [];
  if (items.length === 0) return { uploaded: 0, failed };

  const putConcurrency = options?.putConcurrency ?? DEFAULT_PUT_CONCURRENCY;
  const def = options?.defaultRelativePath?.trim();

  let uploaded = 0;

  for (let offset = 0; offset < items.length; offset += PRESIGN_MAX) {
    const slice = items.slice(offset, offset + PRESIGN_MAX);
    const pres = await fetch("/api/employee-files/presign-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      for (const { file } of slice) failed.push({ name: file.name, message: (pr as { message?: string }).message || "Presign failed" });
      continue;
    }

    const uploads = ((pr as { uploads?: PresignItem[] }).uploads ?? []).slice().sort((a, b) => a.index - b.index);

    const putResults = await runPool(uploads, putConcurrency, async (u) => {
      const entry = slice[u.index];
      const file = entry?.file;
      if (!file?.size) return { ok: false as const, name: u.fileName, message: "Empty file" };
      try {
        const put = await fetch(u.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": u.headers?.["Content-Type"] || file.type || "application/octet-stream",
          },
        });
        if (!put.ok) return { ok: false as const, name: file.name, message: `Storage returned ${put.status}` };
        return { ok: true as const, id: u.id };
      } catch (e) {
        return {
          ok: false as const,
          name: file.name,
          message: e instanceof Error ? e.message : "Upload failed",
        };
      }
    });

    const successes = putResults.filter((r): r is { ok: true; id: string } => r.ok === true).map((r) => r.id);
    for (const r of putResults) {
      if (!r.ok) failed.push({ name: r.name, message: r.message });
    }

    if (successes.length) {
      try {
        await postCompleteBatch(successes);
        uploaded += successes.length;
      } catch (e) {
        failed.push({
          name: `(after ${slice[0]?.file.name ?? "upload"})`,
          message: e instanceof Error ? e.message : "Complete failed",
        });
      }
    }
  }

  return { uploaded, failed };
}
