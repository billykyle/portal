/**
 * Decisions the shoot page and the zip can share.
 * No Node builtins, so client components can import this file.
 */

export const MUX_PLAYBACK_TTL_SECONDS = 12 * 60 * 60;
export const MUX_SOURCE_TTL_SECONDS = 12 * 60 * 60;
/** Basic quality, free encode, capped at 1080p. One standard "highest" MP4. */
export const MUX_VIDEO_QUALITY = "basic";
export const MUX_STATIC_NAME = "highest.mp4";

export type MuxIngestAction = "skip" | "submit" | "refresh";

/** One granted Mux download keeps the NAS for this long before another file may start. */
export const MUX_NAS_PULL_LEASE_MS = 8 * 60 * 1000;
/** Ask Mux to wait this long when a NAS sync is using the share. */
export const MUX_SOURCE_RETRY_AFTER_SECONDS = 60;
/** Ingest may pull originals only from 11pm until 6am Eastern. */
export const MUX_INGEST_TIME_ZONE = "America/New_York";
export const MUX_INGEST_OPEN_HOUR = 23;
export const MUX_INGEST_CLOSE_HOUR = 6;
export const MUX_INGEST_SYNC_REASON = "A NAS sync is running, so Mux will not pull files until it finishes.";
export const MUX_INGEST_OVERNIGHT_REASON =
  "Mux ingest runs from 11pm to 6am Eastern. It waits during the day so a NAS sync can use the share.";

/**
 * How many new assets this backfill may create.
 * A preparing asset may still be copying the original off the NAS, so a second
 * create has to wait. One create per run keeps the rest of the catalog from piling on.
 */
export function muxSubmitBudget(input: { preparing: number; alreadySubmitted: number }) {
  if (input.preparing > 0 || input.alreadySubmitted > 0) return 0;
  return 1;
}

type ZonedClock = { hour: number; minute: number; second: number };

function zonedClock(now: Date, timeZone = MUX_INGEST_TIME_ZONE): ZonedClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { hour: read("hour"), minute: read("minute"), second: read("second") };
}

/** True from 11:00pm through 5:59am Eastern, including both EST and EDT. */
export function muxIngestAllowedAt(now: Date) {
  const { hour } = zonedClock(now);
  return hour >= MUX_INGEST_OPEN_HOUR || hour < MUX_INGEST_CLOSE_HOUR;
}

/**
 * The backfill may start only overnight, unless this call passes allowDaytime.
 * A running NAS sync always waits, including an explicit daytime run.
 */
export function muxBackfillMayStart(input: { syncActive: boolean; overnight: boolean; allowDaytime: boolean }) {
  if (input.syncActive) return false;
  return input.overnight || input.allowDaytime;
}

/** The source route is open overnight, or for a file this daytime run already handed to Mux. */
export function muxSourceIngestAllowed(input: { overnight: boolean; daytimeGrant: boolean }) {
  return input.overnight || input.daytimeGrant;
}

/** How long Mux should wait before asking for a file outside the overnight window. */
export function muxIngestClosedRetryAfterSeconds(now: Date) {
  if (muxIngestAllowedAt(now)) return 0;
  const { hour, minute, second } = zonedClock(now);
  const until = (MUX_INGEST_OPEN_HOUR - hour) * 3600 - minute * 60 - second;
  return Math.max(MUX_SOURCE_RETRY_AFTER_SECONDS, until);
}

/**
 * The source route is the only way Mux reaches the NAS.
 * A running sync wins immediately, day or night. Outside 11pm–6am Eastern
 * every file waits. Overnight, one download may finish and the rest retry.
 */
export function muxSourceDecision(input: {
  syncActive: boolean;
  ingestAllowed: boolean;
  closedRetryAfter: number;
  activePulls: number;
  thisMediaAlreadyPulling: boolean;
}): { allow: true } | { allow: false; retryAfter: number } {
  if (input.syncActive) return { allow: false, retryAfter: MUX_SOURCE_RETRY_AFTER_SECONDS };
  if (!input.ingestAllowed) return { allow: false, retryAfter: Math.max(MUX_SOURCE_RETRY_AFTER_SECONDS, input.closedRetryAfter) };
  if (input.thisMediaAlreadyPulling) return { allow: true };
  if (input.activePulls > 0) return { allow: false, retryAfter: 30 };
  return { allow: true };
}

export type MuxPlaybackView = {
  status: "preparing" | "ready" | "errored" | null;
  playbackId: string | null;
  token: string | null;
  downloadUrl: string | null;
  staticStatus: "preparing" | "ready" | "errored" | "skipped" | null;
  /** Signed Mux thumbnail. The page uses this poster instead of a NAS frame. */
  posterUrl?: string | null;
  thumbnailToken?: string | null;
  storyboardToken?: string | null;
};

export function muxIngestDecision(
  current: {
    type: string;
    assetId: string | null;
    status: string | null;
    staticStatus: string | null;
    sourcePath: string | null;
    sourceBytes: number | null;
  },
  next: { path: string; bytes: number | null },
  force = false,
): MuxIngestAction {
  if (current.type !== "video") return "skip";
  if (force) return "submit";
  const samePath = current.sourcePath === next.path;
  const sizeKnown = next.bytes != null && next.bytes > 0 && current.sourceBytes != null;
  const sameBytes = !sizeKnown || current.sourceBytes === next.bytes;
  const unchanged = Boolean(current.assetId) && samePath && sameBytes && current.status !== "errored";
  if (!unchanged) return "submit";
  if (current.status === "preparing" || (current.status === "ready" && current.staticStatus !== "ready")) {
    return "refresh";
  }
  return "skip";
}

/** Mux Player only when Mux itself says the asset is ready and we can sign it. */
export function playerMode(mux: MuxPlaybackView | null | undefined): "mux" | "deferred" {
  if (mux?.status === "ready" && mux.playbackId && mux.token) return "mux";
  return "deferred";
}

/**
 * A ready Mux video stays on Mux until Download or the player asks for the NAS file.
 * Preparing, errored, and not-yet-sent videos play from the NAS after Play.
 * `fallback=1` is that explicit play, including when a ready Mux player errors.
 */
export function nasOriginalAllowed(input: {
  type: string;
  muxAssetId?: string | null;
  muxStatus?: string | null;
  download: boolean;
  fallback?: boolean;
}) {
  if (input.type !== "video") return true;
  if (input.download || input.fallback) return true;
  if (input.muxStatus === "ready") return false;
  return true;
}

/** Media URL the NAS player requests after Play, or after Mux Player errors. */
export function nasFallbackUrl(url: string) {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = base.indexOf("?");
  const path = queryAt >= 0 ? base.slice(0, queryAt) : base;
  const params = new URLSearchParams(queryAt >= 0 ? base.slice(queryAt + 1) : "");
  params.set("fallback", "1");
  return `${path}?${params.toString()}${hash}`;
}

export function muxPosterUrl(playbackId: string, token: string) {
  const url = new URL(`https://image.mux.com/${playbackId}/thumbnail.jpg`);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Pixel size Mux stored for the video track. Aspect ratio alone is not a size. */
export function muxDisplaySize(asset: {
  tracks?: Array<{ type?: string; max_width?: number | null; max_height?: number | null; width?: number | null; height?: number | null }> | null;
}): { width: number; height: number } | null {
  const track = asset.tracks?.find((item) => item.type === "video");
  const width = Number(track?.max_width || track?.width || 0);
  const height = Number(track?.max_height || track?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

export function downloadMode(mux: MuxPlaybackView | null | undefined): "mux" | "preparing" | "native" {
  if (mux?.downloadUrl) return "mux";
  if (!mux?.status) return "native";
  if (mux.status === "errored" || mux.staticStatus === "errored" || mux.staticStatus === "skipped") {
    return "native";
  }
  if (mux.status === "preparing" || mux.status === "ready") return "preparing";
  return "native";
}

export function isZipExcludedVideo(type: string | undefined) {
  return type === "video" || type === "raw_video";
}

export function muxDownloadStem(filename: string) {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const stem = base.replace(/\.[^.]+$/, "") || base;
  const cleaned = stem.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "video").slice(0, 180);
}

export function muxStaticDownloadUrl(playbackId: string, token: string, filename: string) {
  const url = new URL(`https://stream.mux.com/${playbackId}/${MUX_STATIC_NAME}`);
  url.searchParams.set("token", token);
  url.searchParams.set("download", muxDownloadStem(filename));
  return url.toString();
}

export function videoOmissionNote(filenames: readonly string[]) {
  return [
    "These videos are not in this zip.",
    "A full-length movie cannot finish inside the download, so each video downloads on its own from the shoot page.",
    "That download is a web-quality MP4 (up to 1080p). The full-quality original stays on the NAS.",
    "",
    ...filenames,
    "",
  ].join("\n");
}

export function publicMuxStatus(row: {
  type: string;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  muxStatus: string | null;
  muxStaticStatus: string | null;
  muxError: string | null;
}) {
  if (row.type !== "video") return null;
  return {
    status: row.muxStatus,
    assetId: row.muxAssetId,
    playbackId: row.muxPlaybackId,
    staticStatus: row.muxStaticStatus,
    error: row.muxError,
  };
}

export function nasDownloadLooksPublic(status: number, contentType: string | null) {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/json") || type.startsWith("text/")) return false;
  return status === 200 || status === 206;
}
