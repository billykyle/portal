import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { ensureDb } from "./db/ensure";
import { media, muxConfig } from "./db/schema";
import { muxAssetError, muxDeleteAsset, staticRenditionStatus, type MuxAsset } from "./mux-api";
import { muxPlaybackLinks } from "./mux-sign";
import {
  MUX_MAX_RESOLUTION_TIER,
  muxDisplaySize,
  muxUpgradeMediaId,
  publicMuxStatus,
  redactMuxError,
  type MuxPlaybackView,
} from "./mux-policy";
import { saveDisplaySize } from "./video-store";

export { publicMuxStatus };

const CONFIG_ID = "default";

export type MuxMediaRow = {
  id: string;
  shootId: string;
  type: string;
  filename: string;
  nasRelativePath: string | null;
  byteSize: number | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  muxStatus: string | null;
  muxStaticStatus: string | null;
  muxError: string | null;
  muxResolutionTier: string | null;
  muxPendingAssetId: string | null;
  muxPendingPlaybackId: string | null;
  muxPendingStatus: string | null;
  muxPendingStaticStatus: string | null;
  muxPendingUpdatedAt: Date | null;
  muxSourcePath: string | null;
  muxSourceBytes: number | null;
  muxUpdatedAt: Date | null;
};

const muxColumns = {
  id: media.id,
  shootId: media.shootId,
  type: media.type,
  filename: media.filename,
  nasRelativePath: media.nasRelativePath,
  byteSize: media.byteSize,
  muxAssetId: media.muxAssetId,
  muxPlaybackId: media.muxPlaybackId,
  muxStatus: media.muxStatus,
  muxStaticStatus: media.muxStaticStatus,
  muxError: media.muxError,
  muxResolutionTier: media.muxResolutionTier,
  muxPendingAssetId: media.muxPendingAssetId,
  muxPendingPlaybackId: media.muxPendingPlaybackId,
  muxPendingStatus: media.muxPendingStatus,
  muxPendingStaticStatus: media.muxPendingStaticStatus,
  muxPendingUpdatedAt: media.muxPendingUpdatedAt,
  muxSourcePath: media.muxSourcePath,
  muxSourceBytes: media.muxSourceBytes,
  muxUpdatedAt: media.muxUpdatedAt,
};

export async function listMuxConfig() {
  await ensureDb();
  const [row] = await db.select().from(muxConfig).where(eq(muxConfig.id, CONFIG_ID)).limit(1);
  return row ?? null;
}

export async function saveMuxConfig(patch: {
  signingKeyId?: string | null;
  signingKeyPrivate?: string | null;
  webhookId?: string | null;
  webhookSecret?: string | null;
}) {
  await ensureDb();
  const current = await listMuxConfig();
  const next = {
    id: CONFIG_ID,
    signingKeyId: patch.signingKeyId === undefined ? (current?.signingKeyId ?? null) : patch.signingKeyId,
    signingKeyPrivate:
      patch.signingKeyPrivate === undefined ? (current?.signingKeyPrivate ?? null) : patch.signingKeyPrivate,
    webhookId: patch.webhookId === undefined ? (current?.webhookId ?? null) : patch.webhookId,
    webhookSecret: patch.webhookSecret === undefined ? (current?.webhookSecret ?? null) : patch.webhookSecret,
    updatedAt: new Date(),
  };
  await db
    .insert(muxConfig)
    .values(next)
    .onConflictDoUpdate({
      target: muxConfig.id,
      set: {
        signingKeyId: next.signingKeyId,
        signingKeyPrivate: next.signingKeyPrivate,
        webhookId: next.webhookId,
        webhookSecret: next.webhookSecret,
        updatedAt: next.updatedAt,
      },
    });
  return next;
}

export function signingMaterialFromEnv() {
  const keyId = process.env.MUX_SIGNING_KEY_ID?.trim() || "";
  const privateKey = process.env.MUX_SIGNING_KEY?.trim() || "";
  if (!keyId || !privateKey) return null;
  return { keyId, privateKey, source: "env" as const };
}

export async function loadSigningMaterial() {
  const fromEnv = signingMaterialFromEnv();
  if (fromEnv) return fromEnv;
  const row = await listMuxConfig();
  if (!row?.signingKeyId || !row.signingKeyPrivate) return null;
  return { keyId: row.signingKeyId, privateKey: row.signingKeyPrivate, source: "database" as const };
}

export async function loadWebhookSecret() {
  const fromEnv = process.env.MUX_WEBHOOK_SECRET?.trim() || "";
  if (fromEnv) return fromEnv;
  const row = await listMuxConfig();
  return row?.webhookSecret ?? "";
}

export async function listFinishedVideos(shootId?: string) {
  await ensureDb();
  const rows = await db.select(muxColumns).from(media).where(eq(media.type, "video"));
  return shootId ? rows.filter((row) => row.shootId === shootId) : rows;
}

export async function muxAssetIdsForShoot(shootId: string) {
  await ensureDb();
  const rows = await db
    .select({ muxAssetId: media.muxAssetId, muxPendingAssetId: media.muxPendingAssetId })
    .from(media)
    .where(eq(media.shootId, shootId));
  return rows.flatMap((row) => [row.muxAssetId, row.muxPendingAssetId].filter((id): id is string => Boolean(id)));
}

export async function rememberMuxSubmit(
  id: string,
  input: { sourcePath: string; sourceBytes: number | null },
) {
  await ensureDb();
  await db
    .update(media)
    .set({
      muxStatus: "preparing",
      muxStaticStatus: "preparing",
      muxError: null,
      muxSourcePath: input.sourcePath,
      muxSourceBytes: input.sourceBytes,
      muxUpdatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

function playbackIdOf(asset: MuxAsset) {
  return asset.playback_ids?.find((item) => item.policy === "signed")?.id ?? asset.playback_ids?.[0]?.id ?? null;
}

function tierFromAsset(asset: MuxAsset, explicit?: string | null) {
  if (explicit === "1080p" || explicit === MUX_MAX_RESOLUTION_TIER) return explicit;
  if (asset.max_resolution_tier === "1080p" || asset.max_resolution_tier === MUX_MAX_RESOLUTION_TIER) {
    return asset.max_resolution_tier;
  }
  return null;
}

export async function rememberMuxAsset(
  id: string,
  asset: MuxAsset,
  source: { path: string; bytes: number | null },
  options?: { resolutionTier?: string | null },
) {
  await ensureDb();
  const playbackId = playbackIdOf(asset);
  const status = asset.status === "ready" || asset.status === "errored" ? asset.status : "preparing";
  const tier = tierFromAsset(asset, options?.resolutionTier);
  await db
    .update(media)
    .set({
      muxAssetId: asset.id,
      muxPlaybackId: playbackId,
      muxStatus: status,
      muxStaticStatus: staticRenditionStatus(asset) ?? "preparing",
      muxError: status === "errored" ? redactMuxError(muxAssetError(asset)) ?? "Mux reported this video as errored." : null,
      muxSourcePath: source.path,
      muxSourceBytes: source.bytes,
      // A refresh of a still-preparing asset must not move the clock the timeout reads.
      ...(status === "preparing" ? {} : { muxUpdatedAt: new Date() }),
      ...(tier ? { muxResolutionTier: tier } : {}),
    })
    .where(eq(media.id, id));
  const size = muxDisplaySize(asset);
  if (size) await saveDisplaySize(id, size, "fill");
}

export async function rememberMuxPending(id: string, asset: MuxAsset) {
  await ensureDb();
  const status = asset.status === "ready" || asset.status === "errored" ? asset.status : "preparing";
  await db
    .update(media)
    .set({
      muxPendingAssetId: asset.id,
      muxPendingPlaybackId: playbackIdOf(asset),
      muxPendingStatus: status,
      muxPendingStaticStatus: staticRenditionStatus(asset) ?? "preparing",
      muxPendingUpdatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

/** The 4K copy failed. The live asset stays in place and can be retried after the others. */
export async function failMuxUpgrade(id: string) {
  await ensureDb();
  await db
    .update(media)
    .set({
      muxPendingStatus: "errored",
      muxPendingAssetId: null,
      muxPendingPlaybackId: null,
      muxPendingStaticStatus: null,
      muxPendingUpdatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

/**
 * Point playback at a ready 4K asset, then delete the previous one.
 * The delete happens only after the row is updated.
 */
export async function promoteMuxUpgrade(id: string, asset: MuxAsset) {
  await ensureDb();
  const [current] = await db.select({ muxAssetId: media.muxAssetId }).from(media).where(eq(media.id, id)).limit(1);
  const previous = current?.muxAssetId ?? null;
  await db
    .update(media)
    .set({
      muxAssetId: asset.id,
      muxPlaybackId: playbackIdOf(asset),
      muxStatus: "ready",
      muxStaticStatus: staticRenditionStatus(asset) ?? "preparing",
      muxResolutionTier: MUX_MAX_RESOLUTION_TIER,
      muxError: null,
      muxPendingAssetId: null,
      muxPendingPlaybackId: null,
      muxPendingStatus: null,
      muxPendingStaticStatus: null,
      muxPendingUpdatedAt: null,
      muxUpdatedAt: new Date(),
    })
    .where(eq(media.id, id));
  if (previous && previous !== asset.id) await muxDeleteAsset(previous).catch(() => undefined);
  const size = muxDisplaySize(asset);
  if (size) await saveDisplaySize(id, size, "fill");
  return previous;
}

export async function rememberMuxFailure(id: string, message: string) {
  await ensureDb();
  await db
    .update(media)
    .set({ muxStatus: "errored", muxError: redactMuxError(message) ?? "Mux ingest failed.", muxUpdatedAt: new Date() })
    .where(eq(media.id, id));
}

async function applyUpgradeMuxUpdate(
  mediaId: string,
  input: {
    assetId?: string | null;
    status?: string | null;
    playbackId?: string | null;
    staticStatus?: string | null;
    error?: string | null;
    displaySize?: { width: number; height: number } | null;
  },
) {
  const [row] = await db.select(muxColumns).from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row) return 0;
  const assetId = input.assetId ?? null;
  if (assetId && row.muxAssetId === assetId) {
    const patch: {
      muxStatus?: string;
      muxPlaybackId?: string | null;
      muxStaticStatus?: string | null;
      muxError?: string | null;
      muxUpdatedAt: Date;
    } = { muxUpdatedAt: new Date() };
    if (input.status === "ready" || input.status === "preparing" || input.status === "errored") patch.muxStatus = input.status;
    if (input.playbackId) patch.muxPlaybackId = input.playbackId;
    if (input.staticStatus) patch.muxStaticStatus = input.staticStatus;
    if (input.error !== undefined) patch.muxError = redactMuxError(input.error);
    await db.update(media).set(patch).where(eq(media.id, mediaId));
    if (input.displaySize) await saveDisplaySize(mediaId, input.displaySize, "fill");
    return 1;
  }
  if (input.status === "ready" && assetId) {
    await promoteMuxUpgrade(mediaId, {
      id: assetId,
      status: "ready",
      playback_ids: input.playbackId ? [{ id: input.playbackId, policy: "signed" }] : [],
      static_renditions: input.staticStatus ? { files: [{ status: input.staticStatus, name: "highest.mp4" }] } : undefined,
    });
    if (input.displaySize) await saveDisplaySize(mediaId, input.displaySize, "fill");
    return 1;
  }
  if (input.status === "errored") {
    if (assetId) await muxDeleteAsset(assetId).catch(() => undefined);
    await failMuxUpgrade(mediaId);
    return 1;
  }
  await db
    .update(media)
    .set({
      ...(assetId ? { muxPendingAssetId: assetId } : {}),
      ...(input.playbackId ? { muxPendingPlaybackId: input.playbackId } : {}),
      ...(input.status === "preparing" ? { muxPendingStatus: "preparing" } : {}),
      ...(input.staticStatus ? { muxPendingStaticStatus: input.staticStatus } : {}),
      muxPendingUpdatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));
  return 1;
}

export async function applyMuxAssetUpdate(input: {
  passthrough?: string | null;
  assetId?: string | null;
  status?: string | null;
  playbackId?: string | null;
  staticStatus?: string | null;
  error?: string | null;
  displaySize?: { width: number; height: number } | null;
}) {
  await ensureDb();
  const upgradeId = muxUpgradeMediaId(input.passthrough);
  if (upgradeId) return applyUpgradeMuxUpdate(upgradeId, input);
  const patch: {
    muxStatus?: string;
    muxPlaybackId?: string | null;
    muxAssetId?: string;
    muxStaticStatus?: string | null;
    muxError?: string | null;
    muxUpdatedAt: Date;
  } = { muxUpdatedAt: new Date() };
  if (input.status === "ready" || input.status === "preparing" || input.status === "errored") {
    patch.muxStatus = input.status;
  }
  if (input.playbackId) patch.muxPlaybackId = input.playbackId;
  if (input.assetId) patch.muxAssetId = input.assetId;
  if (input.staticStatus) patch.muxStaticStatus = input.staticStatus;
  if (input.error !== undefined) patch.muxError = redactMuxError(input.error);
  const size = input.displaySize ?? null;
  const rememberSize = async (ids: string[]) => {
    if (!size) return;
    for (const id of ids) await saveDisplaySize(id, size, "fill");
  };
  if (input.passthrough) {
    const updated = await db.update(media).set(patch).where(eq(media.id, input.passthrough)).returning({ id: media.id });
    if (updated.length > 0) {
      await rememberSize(updated.map((row) => row.id));
      return updated.length;
    }
  }
  if (input.assetId) {
    const updated = await db
      .update(media)
      .set(patch)
      .where(eq(media.muxAssetId, input.assetId))
      .returning({ id: media.id });
    await rememberSize(updated.map((row) => row.id));
    return updated.length;
  }
  return 0;
}

export async function muxPlaybackById(files: readonly { id: string; type: string; filename?: string }[]) {
  const ids = files.filter((file) => file.type === "video").map((file) => file.id);
  const views = new Map<string, MuxPlaybackView>();
  if (ids.length === 0) return views;
  await ensureDb();
  const rows = await db.select(muxColumns).from(media).where(inArray(media.id, ids));
  const signing = await loadSigningMaterial();
  const names = new Map(files.map((file) => [file.id, file.filename ?? "video"]));
  for (const row of rows) {
    views.set(row.id, await playbackView(row, names.get(row.id) ?? row.filename, signing));
  }
  return views;
}

export async function muxPlaybackForMedia(id: string) {
  await ensureDb();
  const [row] = await db.select(muxColumns).from(media).where(eq(media.id, id)).limit(1);
  if (!row || row.type !== "video") return null;
  const signing = await loadSigningMaterial();
  return playbackView(row, row.filename, signing);
}

async function playbackView(
  row: MuxMediaRow,
  filename: string,
  signing: { keyId: string; privateKey: string } | null,
): Promise<MuxPlaybackView> {
  const status =
    row.muxStatus === "preparing" || row.muxStatus === "ready" || row.muxStatus === "errored" ? row.muxStatus : null;
  const staticStatus =
    row.muxStaticStatus === "preparing" ||
    row.muxStaticStatus === "ready" ||
    row.muxStaticStatus === "errored" ||
    row.muxStaticStatus === "skipped"
      ? row.muxStaticStatus
      : null;
  let token: string | null = null;
  let downloadUrl: string | null = null;
  let posterUrl: string | null = null;
  let thumbnailToken: string | null = null;
  let storyboardToken: string | null = null;
  if (row.muxPlaybackId && signing) {
    try {
      const links = await muxPlaybackLinks({
        playbackId: row.muxPlaybackId,
        filename,
        keyId: signing.keyId,
        privateKey: signing.privateKey,
        staticReady: staticStatus === "ready",
      });
      token = links.token;
      downloadUrl = links.downloadUrl;
      posterUrl = links.posterUrl;
      thumbnailToken = links.thumbnailToken;
      storyboardToken = links.storyboardToken;
    } catch (error) {
      console.error("Mux playback token failed", row.id, error instanceof Error ? error.message : error);
    }
  }
  return {
    status,
    playbackId: row.muxPlaybackId,
    token,
    downloadUrl,
    staticStatus,
    posterUrl,
    thumbnailToken,
    storyboardToken,
  };
}

