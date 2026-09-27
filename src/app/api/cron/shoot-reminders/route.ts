import { NextResponse, type NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { sendDueShootReminders } from "@/lib/scheduling/shoot-reminder-run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function cronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  await ensureDb();
  const result = await sendDueShootReminders();
  return NextResponse.json(result);
}
