import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { ensureDb } from "./db/ensure";
import { media, muxConfig } from "./db/schema";
import { staticRenditionStatus, type MuxAsset } from "./mux-api";
import { muxPlaybackLinks } from "./mux-sign";
import { publicMuxStatus, type MuxPlaybackView } from "./mux-policy";

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
  muxSourcePath: string | null;
  muxSourceBytes: number | null;
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
  muxSourcePath: media.muxSourcePath,
  muxSourceBytes: media.muxSourceBytes,
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
    .select({ muxAssetId: media.muxAssetId })
    .from(media)
    .where(eq(media.shootId, shootId));
  return rows.map((row) => row.muxAssetId).filter((id): id is string => Boolean(id));
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

export async function rememberMuxAsset(
  id: string,
  asset: MuxAsset,
  source: { path: string; bytes: number | null },
) {
  await ensureDb();
  const playbackId = asset.playback_ids?.find((item) => item.policy === "signed")?.id ?? asset.playback_ids?.[0]?.id ?? null;
  await db
    .update(media)
    .set({
      muxAssetId: asset.id,
      muxPlaybackId: playbackId,
      muxStatus: asset.status === "ready" || asset.status === "errored" ? asset.status : "preparing",
      muxStaticStatus: staticRenditionStatus(asset) ?? "preparing",
      muxError: null,
      muxSourcePath: source.path,
      muxSourceBytes: source.bytes,
      muxUpdatedAt: new Date(),
    })
    .where(eq(media.id, id));
}

export async function rememberMuxFailure(id: string, message: string) {
  await ensureDb();
  await db
    .update(media)
    .set({ muxStatus: "errored", muxError: message.slice(0, 500), muxUpdatedAt: new Date() })
    .where(eq(media.id, id));
}

export async function applyMuxAssetUpdate(input: {
  passthrough?: string | null;
  assetId?: string | null;
  status?: string | null;
  playbackId?: string | null;
  staticStatus?: string | null;
  error?: string | null;
}) {
  await ensureDb();
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
  if (input.error !== undefined) patch.muxError = input.error;
  if (input.passthrough) {
    const updated = await db.update(media).set(patch).where(eq(media.id, input.passthrough)).returning({ id: media.id });
    if (updated.length > 0) return updated.length;
  }
  if (input.assetId) {
    const updated = await db
      .update(media)
      .set(patch)
      .where(eq(media.muxAssetId, input.assetId))
      .returning({ id: media.id });
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
  if (status === "ready" && row.muxPlaybackId && signing) {
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
  };
}

