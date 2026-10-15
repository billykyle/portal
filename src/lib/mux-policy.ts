/**
 * Decisions the shoot page and the zip can share.
 * No Node builtins, so client components can import this file.
 */

export const MUX_PLAYBACK_TTL_SECONDS = 12 * 60 * 60;
export const MUX_SOURCE_TTL_SECONDS = 12 * 60 * 60;
/** Basic quality caps at 720p. One standard "highest" MP4, no advanced rendition encode. */
export const MUX_VIDEO_QUALITY = "basic";
export const MUX_STATIC_NAME = "highest.mp4";

export type MuxIngestAction = "skip" | "submit" | "refresh";

export type MuxPlaybackView = {
  status: "preparing" | "ready" | "errored" | null;
  playbackId: string | null;
  token: string | null;
  downloadUrl: string | null;
  staticStatus: "preparing" | "ready" | "errored" | "skipped" | null;
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

export function playerMode(mux: MuxPlaybackView | null | undefined): "mux" | "processing" | "native" {
  if (!mux?.status) return "native";
  if (mux.status === "ready" && mux.playbackId && mux.token) return "mux";
  if (mux.status === "preparing") return "processing";
  return "native";
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
    "That download is a web-quality MP4 (up to 720p). The full-quality original stays on the NAS.",
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
