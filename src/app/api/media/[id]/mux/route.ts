import { NextResponse } from "next/server";
import { muxPlaybackForMedia } from "@/lib/mux-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await muxPlaybackForMedia(id);
  if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
