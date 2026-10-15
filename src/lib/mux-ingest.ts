import { createNasShareDownloadUrl } from "./nas";
import {
  MuxApiError,
  muxAssetError,
  muxCreateAsset,
  muxCreateSigningKey,
  muxCreateWebhook,
  muxDeleteAsset,
  muxGetAsset,
  muxListAssets,
  muxListWebhooks,
  signedPlaybackId,
  staticRenditionStatus,
} from "./mux-api";
import { muxIngestDecision, nasDownloadLooksPublic, type MuxIngestAction } from "./mux-policy";
import { muxCredentials, muxDashboardSteps, muxSourceUrl, muxWebhookAddress } from "./mux-sign";
import {
  listFinishedVideos,
  listMuxConfig,
  loadSigningMaterial,
  muxAssetIdsForShoot,
  publicMuxStatus,
  rememberMuxAsset,
  rememberMuxFailure,
  rememberMuxSubmit,
  saveMuxConfig,
  type MuxMediaRow,
} from "./mux-store";

export type MuxVideoResult = {
  id: string;
  shootId: string;
  filename: string;
  action: MuxIngestAction | "failed";
  status: string | null;
  staticStatus: string | null;
  assetId: string | null;
  playbackId: string | null;
  error: string | null;
};

export type MuxBackfillReport = {
  credentials: { ok: true; listed: number } | { ok: false; error: string };
  signing: { source: string; message?: string };
  webhook: { source: string; address: string; message?: string };
  directNasFetch: boolean | null;
  considered: number;
  submitted: number;
  refreshed: number;
  skipped: number;
  failed: number;
  videos: MuxVideoResult[];
};

const EMPTY_SETUP = {
  credentials: { ok: false as const, error: "Mux tokens are not set." },
  signing: { source: "missing" },
  webhook: { source: "missing", address: "" },
};

export async function checkMuxCredentials() {
  try {
    const listed = await muxListAssets(1);
    return { ok: true as const, listed: listed.length };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Mux list failed." };
  }
}

export async function ensureMuxSetup() {
  const credentials = await checkMuxCredentials();
  if (!credentials.ok) {
    return {
      credentials,
      signing: { source: "missing", message: credentials.error },
      webhook: { source: "missing", address: muxWebhookAddress(), message: credentials.error },
    };
  }
  const signing = await ensureSigningKey();
  const webhook = await ensureWebhook();
  return { credentials, signing, webhook };
}

async function ensureSigningKey() {
  const existing = await loadSigningMaterial();
  if (existing) return { source: existing.source, message: undefined as string | undefined };
  try {
    const created = await muxCreateSigningKey();
    await saveMuxConfig({ signingKeyId: created.id, signingKeyPrivate: created.privateKey });
    return { source: "created", message: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create a Mux signing key.";
    if (error instanceof MuxApiError && (error.status === 401 || error.status === 403)) {
      return { source: "missing", message: `${message} ${muxDashboardSteps()}` };
    }
    return { source: "missing", message };
  }
}

async function ensureWebhook() {
  const address = muxWebhookAddress();
  if (process.env.MUX_WEBHOOK_SECRET?.trim()) return { source: "env", address, message: undefined as string | undefined };
  const stored = await listMuxConfig();
  if (stored?.webhookSecret) return { source: "database", address, message: undefined };
  try {
    const existing = await muxListWebhooks();
    const match = existing.find((hook) => hook.url === address || hook.address === address);
    if (match && !match.signing_secret) {
      return {
        source: "missing",
        address,
        message: `A Mux webhook already points at ${address}, and its secret was not returned again. ${muxDashboardSteps()}`,
      };
    }
    const created = await muxCreateWebhook(address);
    await saveMuxConfig({ webhookId: created.id, webhookSecret: created.secret });
    return { source: "created", address, message: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the Mux webhook.";
    if (error instanceof MuxApiError && (error.status === 401 || error.status === 403)) {
      return { source: "missing", message: `${message} ${muxDashboardSteps()}`, address };
    }
    return { source: "missing", message, address };
  }
}

export async function nasDirectFetchWorks(nasPath: string, fetchImpl: typeof fetch = fetch) {
  const url = await createNasShareDownloadUrl(nasPath);
  const res = await fetchImpl(url, {
    headers: { Range: "bytes=0-0" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const type = res.headers.get("content-type");
  await res.body?.cancel().catch(() => undefined);
  return nasDownloadLooksPublic(res.status, type);
}

export async function backfillMuxVideos(input: { shootId?: string; force?: boolean } = {}): Promise<MuxBackfillReport> {
  if (!muxCredentials()) {
    return {
      ...EMPTY_SETUP,
      webhook: { ...EMPTY_SETUP.webhook, address: muxWebhookAddress() },
      directNasFetch: null,
      considered: 0,
      submitted: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      videos: [],
    };
  }
  const setup = await ensureMuxSetup();
  const rows = await listFinishedVideos(input.shootId);
  const sample = rows.find((row) => row.nasRelativePath?.startsWith("/"));
  let directNasFetch: boolean | null = null;
  if (sample?.nasRelativePath) {
    try {
      directNasFetch = await nasDirectFetchWorks(sample.nasRelativePath);
    } catch (error) {
      directNasFetch = false;
      const message = error instanceof Error ? error.message : "NAS download URL failed.";
      return {
        ...setup,
        directNasFetch,
        considered: rows.length,
        submitted: 0,
        refreshed: 0,
        skipped: 0,
        failed: rows.length,
        videos: rows.map((row) => resultOf(row, "failed", message)),
      };
    }
  }
  if (directNasFetch === false) {
    const message = "Mux cannot pull this file. The NAS download URL is not reachable without the share cookie.";
    return {
      ...setup,
      directNasFetch,
      considered: rows.length,
      submitted: 0,
      refreshed: 0,
      skipped: 0,
      failed: rows.length,
      videos: rows.map((row) => resultOf(row, "failed", message)),
    };
  }
  const videos = await runMuxRows(rows, input.force === true);
  return { ...setup, directNasFetch, ...countVideos(videos), videos };
}

export async function submitMuxForImported(ids: readonly string[]) {
  if (ids.length === 0 || !muxCredentials()) return { submitted: 0, failed: 0, warnings: [] as string[] };
  const rows = (await listFinishedVideos()).filter((row) => ids.includes(row.id));
  const sample = rows.find((row) => row.nasRelativePath?.startsWith("/"));
  if (sample?.nasRelativePath) {
    const direct = await nasDirectFetchWorks(sample.nasRelativePath);
    if (!direct) {
      return {
        submitted: 0,
        failed: rows.length,
        warnings: ["Mux ingest skipped: the NAS download URL is not reachable without the share cookie."],
      };
    }
  }
  await ensureMuxSetup();
  const videos = await runMuxRows(rows, false);
  const failed = videos.filter((row) => row.action === "failed");
  return {
    submitted: videos.filter((row) => row.action === "submit").length,
    failed: failed.length,
    warnings: failed.map((row) => `Mux ingest failed for ${row.filename}: ${row.error ?? "unknown error"}`),
  };
}

export async function forgetMuxAssets(assetIds: readonly string[]) {
  if (!muxCredentials()) return;
  for (const assetId of assetIds) {
    try {
      await muxDeleteAsset(assetId);
    } catch (error) {
      console.error("Mux asset delete failed", assetId, error instanceof Error ? error.message : error);
    }
  }
}

export async function forgetMuxForShoot(shootId: string) {
  const ids = await muxAssetIdsForShoot(shootId);
  await forgetMuxAssets(ids);
}

async function runMuxRows(rows: MuxMediaRow[], force: boolean) {
  const videos: MuxVideoResult[] = [];
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      if (!row) return;
      videos[index] = await runOne(row, force);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return videos;
}

async function runOne(row: MuxMediaRow, force: boolean): Promise<MuxVideoResult> {
  const next = { path: row.nasRelativePath ?? "", bytes: row.byteSize };
  const action = muxIngestDecision(
    {
      type: row.type,
      assetId: row.muxAssetId,
      status: row.muxStatus,
      staticStatus: row.muxStaticStatus,
      sourcePath: row.muxSourcePath,
      sourceBytes: row.muxSourceBytes,
    },
    next,
    force,
  );
  try {
    if (action === "skip") return resultOf(row, "skip", null);
    if (action === "refresh" && row.muxAssetId) {
      const asset = await muxGetAsset(row.muxAssetId);
      await rememberMuxAsset(row.id, asset, { path: row.muxSourcePath ?? next.path, bytes: row.muxSourceBytes });
      return resultOf(
        {
          ...row,
          muxStatus: asset.status ?? row.muxStatus,
          muxStaticStatus: staticRenditionStatus(asset),
          muxPlaybackId: signedPlaybackId(asset),
          muxError: muxAssetError(asset),
        },
        "refresh",
        muxAssetError(asset),
      );
    }
    if (!next.path.startsWith("/")) return resultOf(row, "failed", "This video has no NAS path.");
    const previous = row.muxAssetId;
    await rememberMuxSubmit(row.id, { sourcePath: next.path, sourceBytes: next.bytes });
    const asset = await muxCreateAsset({ url: muxSourceUrl(row.id), passthrough: row.id });
    await rememberMuxAsset(row.id, asset, next);
    if (previous && previous !== asset.id) await muxDeleteAsset(previous).catch(() => undefined);
    return resultOf(
      {
        ...row,
        muxAssetId: asset.id,
        muxPlaybackId: signedPlaybackId(asset),
        muxStatus: asset.status === "ready" ? "ready" : "preparing",
        muxStaticStatus: staticRenditionStatus(asset) ?? "preparing",
        muxError: null,
      },
      "submit",
      null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mux ingest failed.";
    await rememberMuxFailure(row.id, message).catch(() => undefined);
    return resultOf(row, "failed", message);
  }
}

function resultOf(row: MuxMediaRow, action: MuxVideoResult["action"], error: string | null): MuxVideoResult {
  const mux = publicMuxStatus(row);
  return {
    id: row.id,
    shootId: row.shootId,
    filename: row.filename,
    action,
    status: action === "failed" ? "errored" : mux?.status ?? row.muxStatus,
    staticStatus: mux?.staticStatus ?? row.muxStaticStatus,
    assetId: mux?.assetId ?? row.muxAssetId,
    playbackId: mux?.playbackId ?? row.muxPlaybackId,
    error,
  };
}

function countVideos(videos: MuxVideoResult[]) {
  return {
    considered: videos.length,
    submitted: videos.filter((row) => row.action === "submit").length,
    refreshed: videos.filter((row) => row.action === "refresh").length,
    skipped: videos.filter((row) => row.action === "skip").length,
    failed: videos.filter((row) => row.action === "failed").length,
  };
}
