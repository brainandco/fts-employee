/** S3 single-object PUT limit (use multipart above this). */
export const S3_SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

const S3_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const S3_MAX_MULTIPART_PARTS = 10_000;
const DEFAULT_PART_BYTES = 128 * 1024 * 1024;

/**
 * Part size so the object fits in at most 10_000 parts and each part (except the last) is at least 5 MiB.
 */
export function multipartPartSizeBytesForFile(byteSize: number): number {
  if (!(byteSize > S3_SINGLE_PUT_MAX_BYTES)) {
    throw new Error("multipartPartSizeBytesForFile: file size must exceed single-PUT maximum");
  }
  const minByPartCount = Math.ceil(byteSize / S3_MAX_MULTIPART_PARTS);
  let partSize = Math.max(DEFAULT_PART_BYTES, minByPartCount);
  partSize = Math.ceil(partSize / S3_MIN_PART_SIZE_BYTES) * S3_MIN_PART_SIZE_BYTES;
  return partSize;
}

export function multipartPartCount(byteSize: number, partSizeBytes: number): number {
  return Math.ceil(byteSize / partSizeBytes);
}
