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
import { releaseMuxNasPull } from "./mux-nas-gate";
import {
  MUX_INGEST_SYNC_REASON,
  MUX_MAX_RESOLUTION_TIER,
  MUX_PREPARING_TIMEOUT_REASON,
  muxIngestDecision,
  muxPreparingDisposition,
  muxSubmitBudget,
  muxUpgradePassthrough,
  nasDownloadLooksPublic,
  redactMuxError,
  type MuxIngestAction,
} from "./mux-policy";
import { nasSyncIsActive } from "./nas-sync-store";
import { muxCredentials, muxDashboardSteps, muxSourceUrl, muxWebhookAddress } from "./mux-sign";
import {
  listFinishedVideos,
  listMuxConfig,
  loadSigningMaterial,
  muxAssetIdsForShoot,
  failMuxUpgrade,
  promoteMuxUpgrade,
  publicMuxStatus,
  rememberMuxAsset,
  rememberMuxFailure,
  rememberMuxPending,
  rememberMuxSubmit,
  saveMuxConfig,
  type MuxMediaRow,
} from "./mux-store";

export type MuxVideoResult = {
  id: string;
  shootId: string;
  filename: string;
  action: MuxIngestAction | "failed" | "deferred" | "promoted";
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
  upgraded: number;
  promoted: number;
  refreshed: number;
  skipped: number;
  failed: number;
  deferred: number;
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
    if (muxSetupForbidden(error)) {
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
    if (muxSetupForbidden(error)) {
      return { source: "missing", message: `${message} ${muxDashboardSteps()}`, address };
    }
    return { source: "missing", message, address };
  }
}

function muxSetupForbidden(error: unknown) {
  return error instanceof MuxApiError && (error.status === 401 || error.status === 403 || error.status === 404);
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
      upgraded: 0,
      promoted: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
      videos: [],
    };
  }
  const setup = await ensureMuxSetup();
  const catalog = await listFinishedVideos();
  const rows = input.shootId ? catalog.filter((row) => row.shootId === input.shootId) : catalog;
  const paused = await muxIngestPause();
  if (paused) {
    const videos = rows.map((row) => resultOf(row, "deferred", paused));
    return { ...setup, directNasFetch: null, ...countVideos(videos), videos };
  }
  const settled = await releaseExpiredPreparing(catalog);
  if (settled.preparing > 0) {
    const videos = await runMuxRows(rows, input.force === true, settled);
    return { ...setup, directNasFetch: null, ...countVideos(videos), videos };
  }
  const pausedBeforeNas = await muxIngestPause();
  if (pausedBeforeNas) {
    const videos = rows.map((row) => resultOf(row, "deferred", pausedBeforeNas));
    return { ...setup, directNasFetch: null, ...countVideos(videos), videos };
  }
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
        upgraded: 0,
        promoted: 0,
        refreshed: 0,
        skipped: 0,
        failed: rows.length,
        deferred: 0,
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
      upgraded: 0,
      promoted: 0,
      refreshed: 0,
      skipped: 0,
      failed: rows.length,
      deferred: 0,
      videos: rows.map((row) => resultOf(row, "failed", message)),
    };
  }
  const videos = await runMuxRows(rows, input.force === true, settled);
  return { ...setup, directNasFetch, ...countVideos(videos), videos };
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

/** A NAS sync stops ingest before the next NAS read. */
async function muxIngestPause() {
  if (await nasSyncIsActive()) return MUX_INGEST_SYNC_REASON;
  return null;
}

/**
 * Ask Mux about every preparing asset before another file may start.
 * Errored, and preparing older than 45 minutes, leave the slot. The same run can submit the next file.
 * A file this pass gives up on is not submitted again until a later run.
 */
async function releaseExpiredPreparing(rows: MuxMediaRow[]) {
  const abandoned = new Set<string>();
  const promoted = new Set<string>();
  let preparing = 0;
  for (const row of rows) {
    if (row.muxPendingAssetId && row.muxPendingStatus !== "errored") {
      const stillPreparing = await settlePendingUpgrade(row, abandoned, promoted);
      if (stillPreparing) preparing += 1;
      continue;
    }
    if (row.muxStatus !== "preparing") continue;
    if (!row.muxAssetId) {
      const disposition = muxPreparingDisposition({ status: "preparing", startedAt: row.muxUpdatedAt });
      if (disposition === "timeout" || row.muxUpdatedAt == null) {
        await abandonPreparing(row, MUX_PREPARING_TIMEOUT_REASON, abandoned);
      } else {
        preparing += 1;
      }
      continue;
    }
    try {
      const asset = await muxGetAsset(row.muxAssetId);
      const disposition = muxPreparingDisposition({
        status: asset.status ?? "preparing",
        startedAt: asset.created_at ?? row.muxUpdatedAt,
      });
      if (disposition === "timeout") {
        await abandonPreparing(row, MUX_PREPARING_TIMEOUT_REASON, abandoned);
        await muxDeleteAsset(row.muxAssetId).catch(() => undefined);
        continue;
      }
      if (disposition === "errored" || disposition === "ready") {
        await rememberMuxAsset(row.id, asset, { path: row.muxSourcePath ?? row.nasRelativePath ?? "", bytes: row.muxSourceBytes });
        await releaseMuxNasPull(row.id);
        row.muxStatus = disposition;
        row.muxStaticStatus = staticRenditionStatus(asset);
        row.muxError = disposition === "errored" ? redactMuxError(muxAssetError(asset)) : null;
        if (asset.max_resolution_tier === "1080p" || asset.max_resolution_tier === MUX_MAX_RESOLUTION_TIER) {
          row.muxResolutionTier = asset.max_resolution_tier;
        }
        if (disposition === "errored") abandoned.add(row.id);
        continue;
      }
      preparing += 1;
    } catch (error) {
      const missing = error instanceof MuxApiError && error.status === 404;
      const stale = muxPreparingDisposition({ status: "preparing", startedAt: row.muxUpdatedAt }) === "timeout";
      if (missing || stale) {
        const message = missing
          ? "Mux no longer has this asset, so the backfill released it and moved on."
          : MUX_PREPARING_TIMEOUT_REASON;
        await abandonPreparing(row, message, abandoned);
        continue;
      }
      preparing += 1;
    }
  }
  return { preparing, abandoned, promoted };
}

/** A 4K copy in flight. Ready replaces playback. Timed out or errored keeps the current video. */
async function settlePendingUpgrade(row: MuxMediaRow, abandoned: Set<string>, promoted: Set<string>) {
  const pendingId = row.muxPendingAssetId;
  if (!pendingId) return false;
  try {
    const asset = await muxGetAsset(pendingId);
    const disposition = muxPreparingDisposition({
      status: asset.status ?? "preparing",
      startedAt: asset.created_at ?? row.muxPendingUpdatedAt,
    });
    if (disposition === "ready") {
      await promoteMuxUpgrade(row.id, asset);
      await releaseMuxNasPull(row.id);
      rememberPromoted(row, asset);
      promoted.add(row.id);
      return false;
    }
    if (disposition === "timeout" || disposition === "errored") {
      await releaseUpgrade(row, pendingId);
      abandoned.add(row.id);
      return false;
    }
    row.muxPendingStatus = "preparing";
    return true;
  } catch (error) {
    const missing = error instanceof MuxApiError && error.status === 404;
    const stale = muxPreparingDisposition({ status: "preparing", startedAt: row.muxPendingUpdatedAt }) === "timeout";
    if (missing || stale) {
      await releaseUpgrade(row, missing ? null : pendingId);
      abandoned.add(row.id);
      return false;
    }
    return true;
  }
}

async function releaseUpgrade(row: MuxMediaRow, pendingId: string | null) {
  await failMuxUpgrade(row.id);
  if (pendingId) await muxDeleteAsset(pendingId).catch(() => undefined);
  await releaseMuxNasPull(row.id);
  row.muxPendingAssetId = null;
  row.muxPendingPlaybackId = null;
  row.muxPendingStatus = "errored";
  row.muxPendingStaticStatus = null;
}

function rememberPromoted(row: MuxMediaRow, asset: Awaited<ReturnType<typeof muxGetAsset>>) {
  row.muxAssetId = asset.id;
  row.muxPlaybackId = signedPlaybackId(asset);
  row.muxStatus = "ready";
  row.muxStaticStatus = staticRenditionStatus(asset);
  row.muxResolutionTier = MUX_MAX_RESOLUTION_TIER;
  row.muxError = null;
  row.muxPendingAssetId = null;
  row.muxPendingPlaybackId = null;
  row.muxPendingStatus = null;
  row.muxPendingStaticStatus = null;
}

async function abandonPreparing(row: MuxMediaRow, message: string, abandoned: Set<string>) {
  await rememberMuxFailure(row.id, message);
  await releaseMuxNasPull(row.id);
  row.muxStatus = "errored";
  row.muxError = message;
  abandoned.add(row.id);
}

async function runMuxRows(
  rows: MuxMediaRow[],
  force: boolean,
  settled: { preparing: number; abandoned: Set<string>; promoted: Set<string> },
) {
  const { preparing, abandoned, promoted } = settled;
  const videos: MuxVideoResult[] = [];
  let submitted = 0;
  let retryIndex: number | null = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const pause = await muxIngestPause();
    if (pause) {
      for (let rest = index; rest < rows.length; rest += 1) {
        const pending = rows[rest];
        if (!pending) continue;
        videos[rest] = resultOf(pending, "deferred", pause);
      }
      return videos;
    }
    if (promoted.has(row.id)) {
      videos[index] = resultOf(row, "promoted", null);
      continue;
    }
    if (abandoned.has(row.id)) {
      videos[index] =
        row.muxStatus === "errored"
          ? resultOf(row, "failed", row.muxError)
          : resultOf(row, "deferred", "The 4K copy was released so playback could stay on the current video.");
      continue;
    }
    const decision = decisionFor(row, force);
    if ((decision === "submit" || decision === "upgrade") && muxSubmitBudget({ preparing, alreadySubmitted: submitted }) < 1) {
      videos[index] = resultOf(row, "deferred", "Waiting so Mux does not pull another file from the NAS.");
      continue;
    }
    if (decision === "upgrade" && row.muxPendingStatus === "errored") {
      if (retryIndex == null) retryIndex = index;
      videos[index] = resultOf(row, "deferred", "Waiting until the other 4K copies have started.");
      continue;
    }
    const result = await runOne(row, force);
    videos[index] = result;
    if (result.action === "submit" || result.action === "upgrade") submitted += 1;
    if (result.action === "submit" || result.action === "upgrade" || result.action === "refresh") {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  if (submitted === 0 && preparing === 0 && retryIndex != null) {
    const row = rows[retryIndex];
    if (row) videos[retryIndex] = await runOne(row, force);
  }
  return videos;
}

function decisionFor(row: MuxMediaRow, force: boolean) {
  return muxIngestDecision(
    {
      type: row.type,
      assetId: row.muxAssetId,
      status: row.muxStatus,
      staticStatus: row.muxStaticStatus,
      sourcePath: row.muxSourcePath,
      sourceBytes: row.muxSourceBytes,
      resolutionTier: row.muxResolutionTier,
      pendingStatus: row.muxPendingStatus,
    },
    { path: row.nasRelativePath ?? "", bytes: row.byteSize },
    force,
  );
}

async function runOne(row: MuxMediaRow, force: boolean): Promise<MuxVideoResult> {
  const next = { path: row.nasRelativePath ?? "", bytes: row.byteSize };
  const action = decisionFor(row, force);
  try {
    if (action === "skip") return resultOf(row, "skip", null);
    if (action === "refresh" && row.muxPendingAssetId && row.muxPendingStatus !== "errored") {
      const asset = await muxGetAsset(row.muxPendingAssetId);
      if (asset.status === "ready") {
        await promoteMuxUpgrade(row.id, asset);
        await releaseMuxNasPull(row.id);
        rememberPromoted(row, asset);
        return resultOf(row, "promoted", null);
      }
      await rememberMuxPending(row.id, asset);
      return resultOf(row, "refresh", redactMuxError(muxAssetError(asset)));
    }
    if (action === "refresh" && row.muxAssetId) {
      const asset = await muxGetAsset(row.muxAssetId);
      await rememberMuxAsset(row.id, asset, { path: row.muxSourcePath ?? next.path, bytes: row.muxSourceBytes });
      return resultOf(
        {
          ...row,
          muxStatus: asset.status ?? row.muxStatus,
          muxStaticStatus: staticRenditionStatus(asset),
          muxPlaybackId: signedPlaybackId(asset),
          muxError: redactMuxError(muxAssetError(asset)),
        },
        "refresh",
        redactMuxError(muxAssetError(asset)),
      );
    }
    if (action === "upgrade") {
      if (!next.path.startsWith("/")) return resultOf(row, "failed", "This video has no NAS path.");
      const asset = await muxCreateAsset({ url: muxSourceUrl(row.id), passthrough: muxUpgradePassthrough(row.id) });
      if (asset.status === "ready") {
        await promoteMuxUpgrade(row.id, asset);
        await releaseMuxNasPull(row.id);
        rememberPromoted(row, asset);
        return resultOf(row, "promoted", null);
      }
      const stale = row.muxPendingAssetId;
      await rememberMuxPending(row.id, asset);
      if (stale && stale !== asset.id) await muxDeleteAsset(stale).catch(() => undefined);
      row.muxPendingAssetId = asset.id;
      row.muxPendingStatus = "preparing";
      return {
        ...resultOf(row, "upgrade", null),
        status: "preparing",
        assetId: asset.id,
        playbackId: signedPlaybackId(asset),
      };
    }
    if (!next.path.startsWith("/")) return resultOf(row, "failed", "This video has no NAS path.");
    const previous = row.muxAssetId;
    await rememberMuxSubmit(row.id, { sourcePath: next.path, sourceBytes: next.bytes });
    const asset = await muxCreateAsset({ url: muxSourceUrl(row.id), passthrough: row.id });
    await rememberMuxAsset(row.id, asset, next, { resolutionTier: MUX_MAX_RESOLUTION_TIER });
    if (previous && previous !== asset.id) await muxDeleteAsset(previous).catch(() => undefined);
    return resultOf(
      {
        ...row,
        muxAssetId: asset.id,
        muxPlaybackId: signedPlaybackId(asset),
        muxStatus: asset.status === "ready" ? "ready" : "preparing",
        muxStaticStatus: staticRenditionStatus(asset) ?? "preparing",
        muxResolutionTier: MUX_MAX_RESOLUTION_TIER,
        muxError: null,
      },
      "submit",
      null,
    );
  } catch (error) {
    const message = redactMuxError(error instanceof Error ? error.message : "Mux ingest failed.") ?? "Mux ingest failed.";
    if (action === "upgrade") {
      await failMuxUpgrade(row.id).catch(() => undefined);
      row.muxPendingStatus = "errored";
      row.muxPendingAssetId = null;
      return resultOf(row, "deferred", message);
    }
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
    upgraded: videos.filter((row) => row.action === "upgrade").length,
    promoted: videos.filter((row) => row.action === "promoted").length,
    refreshed: videos.filter((row) => row.action === "refresh").length,
    skipped: videos.filter((row) => row.action === "skip").length,
    failed: videos.filter((row) => row.action === "failed").length,
    deferred: videos.filter((row) => row.action === "deferred").length,
  };
}
