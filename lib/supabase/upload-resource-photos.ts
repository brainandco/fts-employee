import type { SupabaseClient } from "@supabase/supabase-js";

const MIME_REJECT = /mime|not supported|invalid.*type/i;

/** Upload to `resource-photos`; retries as octet-stream if the bucket rejects the declared MIME (e.g. before migration 00052). */
export async function uploadResourcePhotosBuffer(
  admin: SupabaseClient,
  path: string,
  body: Buffer,
  contentType: string,
  options?: { upsert?: boolean }
): Promise<{ error: { message: string } | null }> {
  const upsert = options?.upsert ?? false;
  let { error } = await admin.storage.from("resource-photos").upload(path, body, { contentType, upsert });
  if (error && MIME_REJECT.test(error.message) && contentType !== "application/octet-stream") {
    ({ error } = await admin.storage.from("resource-photos").upload(path, body, {
      contentType: "application/octet-stream",
      upsert,
    }));
  }
  return { error };
}
