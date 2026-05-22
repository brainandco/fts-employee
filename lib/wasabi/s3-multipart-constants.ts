/** S3 single-object PUT hard limit (multipart required above this for one PutObject). */
export const S3_SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Use parallel multipart uploads above this size (much faster than one long PUT on slow links). */
export const MULTIPART_UPLOAD_THRESHOLD_BYTES = 64 * 1024 * 1024;

const S3_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const S3_MAX_MULTIPART_PARTS = 10_000;

/** Default part size for very large objects (fewer parts, less complete overhead). */
const MULTIPART_PART_SIZE_LARGE_BYTES = 128 * 1024 * 1024;

/** Smaller parts so several upload in parallel (better bandwidth use on 100MB–20GiB files). */
const MULTIPART_PART_SIZE_DEFAULT_BYTES = 32 * 1024 * 1024;

const TWENTY_GIB = 20 * 1024 * 1024 * 1024;

export function fileRequiresMultipartUpload(byteSize: number): boolean {
  return byteSize > MULTIPART_UPLOAD_THRESHOLD_BYTES;
}

/**
 * Part size: at most 10_000 parts, each part (except last) at least 5 MiB.
 * Uses 32 MiB parts for typical large uploads; 128 MiB for multi‑tens‑of‑GiB files.
 */
export function multipartPartSizeBytesForFile(byteSize: number): number {
  if (!(byteSize > MULTIPART_UPLOAD_THRESHOLD_BYTES)) {
    throw new Error("multipartPartSizeBytesForFile: file size must exceed multipart threshold");
  }
  const minByPartCount = Math.ceil(byteSize / S3_MAX_MULTIPART_PARTS);
  const target = byteSize > TWENTY_GIB ? MULTIPART_PART_SIZE_LARGE_BYTES : MULTIPART_PART_SIZE_DEFAULT_BYTES;
  let partSize = Math.max(target, minByPartCount);
  partSize = Math.ceil(partSize / S3_MIN_PART_SIZE_BYTES) * S3_MIN_PART_SIZE_BYTES;
  return partSize;
}

export function multipartPartCount(byteSize: number, partSizeBytes: number): number {
  return Math.ceil(byteSize / partSizeBytes);
}

/** Parallel part PUTs from the browser (tune per device). */
export function defaultMultipartPutConcurrency(): number {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    return Math.min(12, Math.max(6, Math.floor(navigator.hardwareConcurrency * 0.75)));
  }
  return 10;
}

/** How many presigned part URLs to fetch per API round-trip. */
export function defaultMultipartPartUrlBatchSize(): number {
  return Math.max(30, defaultMultipartPutConcurrency() * 4);
}
