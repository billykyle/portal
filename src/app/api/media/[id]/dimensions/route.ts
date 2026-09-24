import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { ensureVideoDisplaySize } from "@/lib/video-dimensions";
import { saveDisplaySize } from "@/lib/video-store";
import { shouldReportDisplaySize } from "@/lib/video-playback";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await ensureDb();
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!item || item.type !== "video") {
    return noStore({ error: "Not found." }, 404);
  }
  if (item.width && item.height) {
    return noStore({ width: item.width, height: item.height });
  }
  try {
    const size = await ensureVideoDisplaySize(item.id, item.nasRelativePath);
    return noStore({ width: size?.width ?? null, height: size?.height ?? null });
  } catch (error) {
    console.error(`Video dimensions failed for ${item.filename}:`, error);
    return noStore({ width: null, height: null });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await ensureDb();
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!item || item.type !== "video") {
    return noStore({ error: "Not found." }, 404);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: "Expected JSON." }, 400);
  }
  const width = Number((body as { width?: unknown })?.width);
  const height = Number((body as { height?: unknown })?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return noStore({ error: "Width and height must be whole pixels." }, 400);
  }
  const reported = { width, height };
  const stored = item.width && item.height ? { width: item.width, height: item.height } : null;
  if (!shouldReportDisplaySize(stored, reported)) {
    return noStore({ width: stored?.width ?? null, height: stored?.height ?? null });
  }
  await saveDisplaySize(item.id, reported, "correct");
  return noStore({ width, height });
}
