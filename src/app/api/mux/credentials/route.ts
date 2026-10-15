import { NextResponse } from "next/server";
import { MuxApiError, muxListAssets, muxListSigningKeys, muxListWebhooks } from "@/lib/mux-api";
import { muxCredentials, muxWebhookAddress } from "@/lib/mux-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function denied(error: unknown) {
  if (error instanceof MuxApiError) return { ok: false, status: error.status, error: error.message };
  return { ok: false, status: 0, error: error instanceof Error ? error.message : "Mux request failed." };
}

/** Read-only check of the Vercel Mux token. Does not create keys or assets. */
export async function GET() {
  const creds = muxCredentials();
  if (!creds) {
    return NextResponse.json({
      tokens: false,
      assets: { ok: false, error: "MUX_TOKEN_ID or MUX_TOKEN_SECRET is empty." },
    });
  }
  const [assets, signing, webhooks] = await Promise.all([
    muxListAssets(1).then((rows) => ({ ok: true, listed: rows.length })).catch(denied),
    muxListSigningKeys().then((rows) => ({ ok: true, count: rows.length })).catch(denied),
    muxListWebhooks()
      .then((rows) => ({
        ok: true,
        count: rows.length,
        matchesPortal: rows.some((row) => row.url === muxWebhookAddress() || row.address === muxWebhookAddress()),
      }))
      .catch(denied),
  ]);
  return NextResponse.json({
    tokens: true,
    signingKeyEnv: Boolean(process.env.MUX_SIGNING_KEY_ID?.trim() && process.env.MUX_SIGNING_KEY?.trim()),
    webhookSecretEnv: Boolean(process.env.MUX_WEBHOOK_SECRET?.trim()),
    assets,
    signing,
    webhooks,
  });
}
