import type { S3Client } from "@aws-sdk/client-s3";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PRESIGN_PART_EXPIRES_SEC = 4 * 3600;

export async function s3CreateMultipartUpload(
  s3: S3Client,
  bucket: string,
  key: string,
  contentType: string
): Promise<string> {
  const out = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })
  );
  const uploadId = out.UploadId;
  if (!uploadId) throw new Error("CreateMultipartUpload: missing UploadId");
  return uploadId;
}

export async function s3PresignUploadPart(
  s3: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const cmd = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3, cmd, { expiresIn: PRESIGN_PART_EXPIRES_SEC });
}

export async function s3CompleteMultipartUpload(
  s3: S3Client,
  bucket: string,
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((p) => ({
          PartNumber: p.PartNumber,
          ETag: p.ETag,
        })),
      },
    })
  );
}

export async function s3AbortMultipartUpload(
  s3: S3Client,
  bucket: string,
  key: string,
  uploadId: string
): Promise<void> {
  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}

export function multipartPartSignExpiresSec(): number {
  return PRESIGN_PART_EXPIRES_SEC;
}
