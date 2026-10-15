import { NextResponse } from "next/server";
import { applyMuxEvent } from "@/lib/mux-events";
import { loadWebhookSecret } from "@/lib/mux-store";
import { verifyMuxWebhook } from "@/lib/mux-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = await loadWebhookSecret();
  if (!secret || !verifyMuxWebhook(raw, request.headers.get("mux-signature"), secret)) {
    return NextResponse.json({ error: "Invalid Mux signature." }, { status: 401 });
  }
  let event: Parameters<typeof applyMuxEvent>[0];
  try {
    event = JSON.parse(raw) as Parameters<typeof applyMuxEvent>[0];
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    const updated = await applyMuxEvent(event);
    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("Mux webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Webhook failed." }, { status: 500 });
  }
}
