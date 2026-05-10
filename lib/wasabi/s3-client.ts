import { S3Client } from "@aws-sdk/client-s3";

let cachedEmployeeFilesS3: S3Client | null = null;
let cachedPpReportsDedicatedS3: S3Client | null = null;

export function getWasabiS3Client(): S3Client {
  const accessKeyId = process.env.WASABI_ACCESS_KEY;
  const secretAccessKey = process.env.WASABI_SECRET_ACCESS_KEY;
  const region = process.env.WASABI_REGION;
  const endpoint = process.env.WASABI_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !region || !endpoint) {
    throw new Error("Wasabi is not configured. Set WASABI_* env vars on the employee portal.");
  }
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export function getWasabiBucket(): string {
  const b = process.env.WASABI_BUCKET;
  if (!b?.trim()) throw new Error("WASABI_BUCKET is not set.");
  return b.trim();
}

export function getWasabiEmployeeFilesBucket(): string {
  const b = process.env.WASABI_EMPLOYEE_FILES_BUCKET?.trim();
  if (!b) {
    throw new Error("WASABI_EMPLOYEE_FILES_BUCKET is not set (employee file storage).");
  }
  return b;
}

/** Reuses one client per isolate — faster repeated browse / upload calls. */
export function getWasabiEmployeeFilesS3Client(): S3Client {
  if (cachedEmployeeFilesS3) return cachedEmployeeFilesS3;
  const accessKeyId = process.env.WASABI_EMPLOYEE_FILES_ACCESS_KEY;
  const secretAccessKey = process.env.WASABI_EMPLOYEE_FILES_SECRET_ACCESS_KEY;
  const region = process.env.WASABI_EMPLOYEE_FILES_REGION;
  const endpoint = process.env.WASABI_EMPLOYEE_FILES_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !region || !endpoint) {
    throw new Error(
      "Employee file storage: set WASABI_EMPLOYEE_FILES_ACCESS_KEY, WASABI_EMPLOYEE_FILES_SECRET_ACCESS_KEY, WASABI_EMPLOYEE_FILES_REGION, and WASABI_EMPLOYEE_FILES_ENDPOINT."
    );
  }
  cachedEmployeeFilesS3 = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return cachedEmployeeFilesS3;
}

export function getWasabiEmployeeFilesKeyPrefix(): string {
  const p = process.env.WASABI_EMPLOYEE_FILES_PREFIX?.trim();
  if (p) return p.replace(/^\/+|\/+$/g, "");
  return "employee-files";
}

/**
 * Optional presign-time max size (bytes) for employee / PP Wasabi uploads.
 * Unset, empty, or `"0"` = no application cap (browser still uses one PUT; S3-compatible stores typically allow up to ~5 GiB per single PUT).
 * Set a positive integer to enforce a maximum (e.g. `1073741824` for 1 GiB).
 */
export function getWasabiEmployeeFileMaxBytes(): number {
  const raw = process.env.WASABI_EMPLOYEE_FILE_MAX_BYTES?.trim();
  if (!raw || raw === "0") return 0;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return 0;
}

/** Separate bucket for PP final reports (`WASABI_PP_REPORTS_BUCKET`). Optional dedicated credentials via WASABI_PP_REPORTS_* access vars. */
export function getWasabiPpReportsBucket(): string | null {
  const b = process.env.WASABI_PP_REPORTS_BUCKET?.trim();
  return b || null;
}

export function isPpReportsBucketConfigured(): boolean {
  return getWasabiPpReportsBucket() != null;
}

/** Top-level prefix inside the PP reports bucket (default: none = projects at bucket root). */
export function getWasabiPpReportsKeyPrefix(): string {
  const p = process.env.WASABI_PP_REPORTS_PREFIX?.trim();
  if (!p) return "";
  return p.replace(/^\/+|\/+$/g, "");
}

/**
 * Optional separate Wasabi sub-user for PP final reports only.
 * Set all four, or omit all four to reuse WASABI_EMPLOYEE_FILES_* credentials for the PP bucket.
 */
export function isPpReportsDedicatedCredentialsConfigured(): boolean {
  const accessKeyId = process.env.WASABI_PP_REPORTS_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.WASABI_PP_REPORTS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.WASABI_PP_REPORTS_REGION?.trim();
  const endpoint = process.env.WASABI_PP_REPORTS_ENDPOINT?.trim();
  return !!(accessKeyId && secretAccessKey && region && endpoint);
}

/**
 * S3 client for `WASABI_PP_REPORTS_BUCKET`. Uses dedicated PP credentials when all of
 * WASABI_PP_REPORTS_ACCESS_KEY, WASABI_PP_REPORTS_SECRET_ACCESS_KEY, WASABI_PP_REPORTS_REGION,
 * WASABI_PP_REPORTS_ENDPOINT are set; otherwise falls back to {@link getWasabiEmployeeFilesS3Client}.
 */
export function getWasabiPpReportsS3Client(): S3Client {
  const accessKeyId = process.env.WASABI_PP_REPORTS_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.WASABI_PP_REPORTS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.WASABI_PP_REPORTS_REGION?.trim();
  const endpoint = process.env.WASABI_PP_REPORTS_ENDPOINT?.trim();
  const partial =
    !!(accessKeyId || secretAccessKey || region || endpoint) &&
    !(accessKeyId && secretAccessKey && region && endpoint);
  if (partial) {
    throw new Error(
      "PP reports Wasabi user: set all of WASABI_PP_REPORTS_ACCESS_KEY, WASABI_PP_REPORTS_SECRET_ACCESS_KEY, WASABI_PP_REPORTS_REGION, WASABI_PP_REPORTS_ENDPOINT, or remove those variables to use the employee-files credentials."
    );
  }
  if (accessKeyId && secretAccessKey && region && endpoint) {
    if (!cachedPpReportsDedicatedS3) {
      cachedPpReportsDedicatedS3 = new S3Client({
        region,
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    }
    return cachedPpReportsDedicatedS3;
  }
  return getWasabiEmployeeFilesS3Client();
}
