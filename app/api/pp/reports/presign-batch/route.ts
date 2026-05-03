import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  isAllowedEmployeeFileName,
  normalizeRelativePathUnderEmployee,
  safeEmployeeFileName,
} from "@/lib/employee-files/storage";
import { requirePostProcessor } from "@/lib/pp/auth";
import { buildPpReportObjectKey, scopeReporterRelativePath } from "@/lib/pp-reports/storage";
import {
  getWasabiEmployeeFileMaxBytes,
  getWasabiPpReportsBucket,
  getWasabiPpReportsS3Client,
  isPpReportsBucketConfigured,
} from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const PRESIGN_EXPIRES_SEC = 3600;
const MAX_ITEMS = 100;

type ItemIn = {
  fileName?: string;
  contentType?: string | null;
  byteSize?: number | null;
  relativePath?: string | null;
};

type Body = {
  defaultRelativePath?: string | null;
  items?: ItemIn[];
};

/** Paths are under the reporter's named folder only (client sends browse path, not slug). */
function combineUnderReporter(defaultRel: string | null | undefined, itemRel: string | null | undefined): string | null {
  const a = (defaultRel ?? "").trim();
  const b = (itemRel ?? "").trim();
  if (!a && !b) return "";
  if (!a) return normalizeRelativePathUnderEmployee(b);
  if (!b) return normalizeRelativePathUnderEmployee(a);
  const joined = `${a}/${b}`;
  return normalizeRelativePathUnderEmployee(joined);
}

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  if (!isPpReportsBucketConfigured()) {
    return NextResponse.json({ message: "PP reports bucket is not configured." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    return NextResponse.json({ message: "items must be a non-empty array" }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ message: `At most ${MAX_ITEMS} files per batch` }, { status: 400 });
  }

  const defRaw = body.defaultRelativePath;
  const defaultUnder =
    defRaw != null && String(defRaw).trim() !== "" ? normalizeRelativePathUnderEmployee(String(defRaw)) : "";
  if (defRaw != null && String(defRaw).trim() !== "" && !defaultUnder) {
    return NextResponse.json({ message: "Invalid defaultRelativePath" }, { status: 400 });
  }

  const maxB = getWasabiEmployeeFileMaxBytes();

  type Prepared = {
    index: number;
    fileName: string;
    contentType: string;
    storageKey: string;
  };

  const prepared: Prepared[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i]!;
    const fileName = safeEmployeeFileName(String(it.fileName ?? ""));
    if (!isAllowedEmployeeFileName(fileName)) {
      return NextResponse.json({ message: `Row ${i + 1}: file type not allowed (${fileName}).` }, { status: 400 });
    }
    const contentType = String(it.contentType ?? "application/octet-stream").trim() || "application/octet-stream";
    const byteSize = typeof it.byteSize === "number" && Number.isFinite(it.byteSize) ? Math.floor(it.byteSize) : null;
    if (byteSize != null && byteSize > maxB) {
      return NextResponse.json({ message: `Row ${i + 1}: exceeds maximum size (${maxB} bytes)` }, { status: 400 });
    }

    const itemRelRaw = it.relativePath;
    const combinedUnder = combineUnderReporter(
      defaultUnder,
      itemRelRaw != null && String(itemRelRaw).trim() !== "" ? String(itemRelRaw) : null
    );
    if (combinedUnder === null) {
      return NextResponse.json({ message: `Row ${i + 1}: invalid relativePath` }, { status: 400 });
    }

    const scoped = scopeReporterRelativePath(gate.reporterFolderSlug, combinedUnder);
    if (!scoped) {
      return NextResponse.json({ message: `Row ${i + 1}: invalid path` }, { status: 400 });
    }

    let storageKey: string;
    try {
      storageKey = buildPpReportObjectKey(scoped, fileName);
    } catch (e) {
      return NextResponse.json(
        { message: e instanceof Error ? e.message : `Row ${i + 1}: invalid upload` },
        { status: 400 }
      );
    }

    prepared.push({ index: i, fileName, contentType, storageKey });
  }

  try {
    const s3 = getWasabiPpReportsS3Client();
    const bucket = getWasabiPpReportsBucket()!;
    const uploads = await Promise.all(
      prepared.map(async (p) => {
        const cmd = new PutObjectCommand({
          Bucket: bucket,
          Key: p.storageKey,
          ContentType: p.contentType,
        });
        const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
        return {
          index: p.index,
          uploadUrl,
          storageKey: p.storageKey,
          fileName: p.fileName,
          headers: { "Content-Type": p.contentType },
        };
      })
    );
    return NextResponse.json({
      uploads: uploads.sort((a, b) => a.index - b.index),
      expiresIn: PRESIGN_EXPIRES_SEC,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Presign failed";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
