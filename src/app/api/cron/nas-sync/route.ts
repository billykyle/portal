import { NextResponse, type NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { nasEnabled } from "@/lib/nas-flags";
import { runLockedNasSync } from "@/lib/nas-scheduler";

export const runtime = "nodejs";
export const maxDuration = 300;
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
  if (!nasEnabled()) {
    return NextResponse.json({ skipped: true, reason: "NAS_ENABLED is not true." });
  }
  await ensureDb();
  const result = await runLockedNasSync("cron");
  return NextResponse.json(result);
}
