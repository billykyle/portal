import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media } from "@/lib/db/schema";
import { createNasShareDownloadUrl } from "@/lib/nas";
import { grantMuxNasPull } from "@/lib/mux-nas-gate";
import { verifyMuxSource } from "@/lib/mux-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function redirectToNas(id: string, request: Request) {
  const url = new URL(request.url);
  if (!verifyMuxSource(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return NextResponse.json({ error: "This video link has expired." }, { status: 401 });
  }
  await ensureDb();
  const [item] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!item || item.type !== "video" || !item.nasRelativePath?.startsWith("/")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const grant = await grantMuxNasPull(item.id);
  if (!grant.allow) {
    return NextResponse.json(
      { error: "The NAS is busy. Mux can retry this file." },
      { status: 503, headers: { "retry-after": String(grant.retryAfter), "cache-control": "no-store" } },
    );
  }
  const target = await createNasShareDownloadUrl(item.nasRelativePath);
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return await redirectToNas(id, request);
  } catch (error) {
    console.error("Mux source redirect failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not open the NAS file for Mux." }, { status: 502 });
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}
