import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getDataClient } from "@/lib/supabase/server";
import { runPool } from "@/lib/employee-files/concurrency-pool";
import { requirePostProcessor } from "@/lib/pp/auth";
import { getWasabiEmployeeFilesBucket, getWasabiEmployeeFilesS3Client } from "@/lib/wasabi/s3-client";
import { NextResponse } from "next/server";

const MAX_IDS = 100;
const HEAD_CONCURRENCY = 12;

type Body = { ids?: string[] };

export async function POST(req: Request) {
  const gate = await requirePostProcessor();
  if (gate instanceof NextResponse) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.ids) ? body.ids.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const unique = [...new Set(rawIds)];
  if (unique.length === 0) {
    return NextResponse.json({ message: "ids must be a non-empty array" }, { status: 400 });
  }
  if (unique.length > MAX_IDS) {
    return NextResponse.json({ message: `At most ${MAX_IDS} ids per batch` }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { data: rows, error: fetchErr } = await supabase
    .from("employee_personal_files")
    .select("id, storage_key, upload_status")
    .in("id", unique);

  if (fetchErr) {
    return NextResponse.json({ message: fetchErr.message }, { status: 400 });
  }

  const pending = (rows ?? []).filter((r) => r.upload_status === "pending");
  if (pending.length === 0) {
    return NextResponse.json({ message: "No pending uploads found for those ids" }, { status: 400 });
  }

  const bucket = getWasabiEmployeeFilesBucket();
  const s3 = getWasabiEmployeeFilesS3Client();

  const headResults = await runPool(pending, HEAD_CONCURRENCY, async (row) => {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: row.storage_key }));
      const size = typeof head.ContentLength === "number" ? head.ContentLength : null;
      return { kind: "ok" as const, id: row.id as string, byte_size: size };
    } catch {
      return { kind: "fail" as const, id: row.id as string };
    }
  });

  const okIds: { id: string; byte_size: number | null }[] = [];
  const failedIds: string[] = [];
  for (const hr of headResults) {
    if (hr.kind === "ok") okIds.push({ id: hr.id, byte_size: hr.byte_size });
    else failedIds.push(hr.id);
  }

  if (failedIds.length) {
    await supabase.from("employee_personal_files").update({ upload_status: "failed" }).in("id", failedIds);
  }

  await runPool(okIds, 8, async ({ id, byte_size }) => {
    await supabase.from("employee_personal_files").update({ upload_status: "active", byte_size }).eq("id", id);
    return null;
  });

  return NextResponse.json({
    completed: okIds.length,
    failed: failedIds.length,
    ids: okIds.map((x) => x.id),
  });
}
