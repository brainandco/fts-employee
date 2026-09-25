import { NextResponse } from "next/server";
import { runDutyReminders } from "@/lib/odometer/duty-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(req: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const header = (req.headers.get("x-cron-secret") ?? "").trim();
  if (header && header === secret) return true;

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
  const url = new URL(req.url);
  const q = (url.searchParams.get("secret") ?? "").trim();
  if (q && q === secret) return true;

  return false;
}

/** GET/POST — process open vehicle duties; send 4h/8h/12h reminder notifications. */
async function handle(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDutyReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Duty reminders failed";
    console.error("[cron/duty-reminders]", e);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
