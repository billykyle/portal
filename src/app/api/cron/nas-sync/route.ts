import { NextResponse, type NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/ensure";
import { nasEnabled } from "@/lib/nas-flags";
import { runLockedNasSync } from "@/lib/nas-scheduler";
import { warmMissingPreviews } from "@/lib/warm-previews";

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
  let previewsWarmed = 0;
  let previewWarmError: string | null = null;
  try {
    const warm = await warmMissingPreviews({ limit: 20, budgetMs: 20_000 });
    previewsWarmed = warm.warmed;
  } catch (error) {
    previewWarmError = error instanceof Error ? error.message : "Preview backfill failed.";
    console.error("Preview backfill failed:", error);
  }
  return NextResponse.json({ ...result, previewsWarmed, previewWarmError });
}
