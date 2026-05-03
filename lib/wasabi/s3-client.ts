import { S3Client } from "@aws-sdk/client-s3";

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

/** Dedicated Wasabi user + bucket for employee file uploads (not the main software-library credentials). */
export function getWasabiEmployeeFilesS3Client(): S3Client {
  const accessKeyId = process.env.WASABI_EMPLOYEE_FILES_ACCESS_KEY;
  const secretAccessKey = process.env.WASABI_EMPLOYEE_FILES_SECRET_ACCESS_KEY;
  const region = process.env.WASABI_EMPLOYEE_FILES_REGION;
  const endpoint = process.env.WASABI_EMPLOYEE_FILES_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !region || !endpoint) {
    throw new Error(
      "Employee file storage: set WASABI_EMPLOYEE_FILES_ACCESS_KEY, WASABI_EMPLOYEE_FILES_SECRET_ACCESS_KEY, WASABI_EMPLOYEE_FILES_REGION, and WASABI_EMPLOYEE_FILES_ENDPOINT."
    );
  }
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export function getWasabiEmployeeFilesKeyPrefix(): string {
  const p = process.env.WASABI_EMPLOYEE_FILES_PREFIX?.trim();
  if (p) return p.replace(/^\/+|\/+$/g, "");
  return "employee-files";
}

export function getWasabiEmployeeFileMaxBytes(): number {
  const raw = process.env.WASABI_EMPLOYEE_FILE_MAX_BYTES;
  if (raw && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10);
  return 100 * 1024 * 1024;
}

/** Separate bucket for PP final reports (same IAM user as employee files recommended). */
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
