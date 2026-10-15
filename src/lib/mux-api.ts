import { MUX_STATIC_NAME, MUX_VIDEO_QUALITY } from "./mux-policy";
import { muxCredentials, muxWebhookAddress } from "./mux-sign";

export class MuxApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MuxApiError";
    this.status = status;
  }
}

type MuxData<T> = { data: T };

export type MuxAsset = {
  id: string;
  status?: string;
  passthrough?: string | null;
  errors?: { type?: string; messages?: string[] };
  playback_ids?: Array<{ id: string; policy: string }>;
  static_renditions?: {
    files?: Array<{ id?: string; status?: string; resolution?: string; name?: string }>;
  };
};

export type MuxSigningKey = { id: string; private_key?: string };
export type MuxWebhook = { id: string; url?: string; address?: string; signing_secret?: string };

async function muxFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const creds = muxCredentials();
  if (!creds) throw new MuxApiError(0, "Mux tokens are not set.");
  const auth = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64");
  const res = await fetch(`https://api.mux.com${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Basic ${auth}`,
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }
  if (!res.ok) {
    const record = parsed && typeof parsed === "object" ? (parsed as { error?: { messages?: string[]; message?: string } }) : null;
    const message =
      record?.error?.messages?.filter(Boolean).join(" ") ||
      record?.error?.message ||
      text.slice(0, 240) ||
      `Mux returned ${res.status}.`;
    throw new MuxApiError(res.status, message);
  }
  return parsed as T;
}

export async function muxListAssets(limit = 1) {
  const body = await muxFetch<MuxData<MuxAsset[]>>(`/video/v1/assets?limit=${limit}`);
  return body.data ?? [];
}

export async function muxCreateAsset(input: { url: string; passthrough: string }) {
  const body = await muxFetch<MuxData<MuxAsset>>("/video/v1/assets", {
    method: "POST",
    body: {
      inputs: [{ url: input.url }],
      playback_policies: ["signed"],
      video_quality: MUX_VIDEO_QUALITY,
      max_resolution_tier: "1080p",
      static_renditions: [{ resolution: "highest" }],
      passthrough: input.passthrough,
      meta: { external_id: input.passthrough },
    },
  });
  return body.data;
}

export async function muxGetAsset(assetId: string) {
  const body = await muxFetch<MuxData<MuxAsset>>(`/video/v1/assets/${assetId}`);
  return body.data;
}

export async function muxDeleteAsset(assetId: string) {
  try {
    await muxFetch(`/video/v1/assets/${assetId}`, { method: "DELETE" });
  } catch (error) {
    if (error instanceof MuxApiError && error.status === 404) return;
    throw error;
  }
}

export function signedPlaybackId(asset: MuxAsset) {
  return asset.playback_ids?.find((item) => item.policy === "signed")?.id ?? asset.playback_ids?.[0]?.id ?? null;
}

export function staticRenditionStatus(asset: MuxAsset) {
  const files = asset.static_renditions?.files ?? [];
  const match = files.find((file) => file.name === MUX_STATIC_NAME || file.resolution === "highest");
  const status = match?.status ?? null;
  if (status === "preparing" || status === "ready" || status === "errored" || status === "skipped") return status;
  return null;
}

export function muxAssetError(asset: MuxAsset) {
  const messages = asset.errors?.messages?.filter(Boolean) ?? [];
  return messages.join(" ") || null;
}

export async function muxCreateSigningKey() {
  const body = await muxFetch<MuxData<MuxSigningKey>>("/system/v1/signing-keys", { method: "POST", body: {} });
  if (!body.data?.id || !body.data.private_key) throw new MuxApiError(500, "Mux did not return a signing key.");
  return { id: body.data.id, privateKey: body.data.private_key };
}

export async function muxListWebhooks() {
  const body = await muxFetch<MuxData<MuxWebhook[]>>("/system/v1/webhooks");
  return body.data ?? [];
}

export async function muxCreateWebhook(address = muxWebhookAddress()) {
  const body = await muxFetch<MuxData<MuxWebhook>>("/system/v1/webhooks", {
    method: "POST",
    body: { address },
  });
  if (!body.data?.id || !body.data.signing_secret) throw new MuxApiError(500, "Mux did not return a webhook secret.");
  return { id: body.data.id, secret: body.data.signing_secret, address };
}
