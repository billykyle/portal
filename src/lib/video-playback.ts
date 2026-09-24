/**
 * Player decisions with no Node builtins, so the shoot page can import them.
 * File paths, ffmpeg, and the NAS mount live in `video-renditions.ts`.
 */

export const VIDEO_QUALITIES = ["720", "1080"] as const;
export type VideoQuality = (typeof VIDEO_QUALITIES)[number];
export type QualityChoice = "auto" | VideoQuality | "original";
export type PlaybackQuality = VideoQuality | "original";
export type VideoDisplaySize = { width: number; height: number };

export const VIDEO_FRAME_MAX_HEIGHT = "min(78dvh, 920px)";

export function isVideoQuality(value: string | null | undefined): value is VideoQuality {
  return value === "720" || value === "1080";
}

export function renditionPlayUrl(mediaId: string, quality: VideoQuality) {
  return `/api/media/${mediaId}?rendition=${quality}`;
}

/** Matches `videoSourceType` in media-response. Kept here so the player does not import `fs`. */
export function playbackSourceType(filename: string) {
  return /\.webm$/i.test(filename) ? "video/webm" : "video/mp4";
}

export function renditionFilename(filename: string, quality: VideoQuality) {
  const base = filename.replace(/\.[^.]+$/, "") || filename;
  return `${base}.${quality}.mp4`;
}

/**
 * Auto plays the lighter rendition when one exists: 720p, then 1080p.
 * An explicit choice is used only when that file is on the share.
 */
export function resolvePlaybackQuality(choice: QualityChoice, available: readonly VideoQuality[]): PlaybackQuality {
  if (choice === "720" || choice === "1080") {
    return available.includes(choice) ? choice : "original";
  }
  if (choice === "original") return "original";
  if (available.includes("720")) return "720";
  if (available.includes("1080")) return "1080";
  return "original";
}

export function availableQualities(renditions: readonly { quality: string }[]): VideoQuality[] {
  const present = new Set(renditions.map((item) => item.quality));
  return VIDEO_QUALITIES.filter((quality) => present.has(quality));
}

export function videoFrameStyle(width: number | null, height: number | null): {
  aspectRatio?: string;
  width: string;
  maxHeight: string;
  minHeight?: string;
} {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: "100%", maxHeight: VIDEO_FRAME_MAX_HEIGHT, minHeight: "12rem" };
  }
  const ratio = width / height;
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, calc(${VIDEO_FRAME_MAX_HEIGHT} * ${ratio.toFixed(6)}))`,
    maxHeight: VIDEO_FRAME_MAX_HEIGHT,
  };
}

export function shouldReportDisplaySize(stored: VideoDisplaySize | null, reported: VideoDisplaySize) {
  if (reported.width < 16 || reported.height < 16 || reported.width > 8000 || reported.height > 8000) {
    return false;
  }
  if (!stored || stored.width <= 0 || stored.height <= 0) return true;
  const storedRatio = stored.width / stored.height;
  const nextRatio = reported.width / reported.height;
  if (!Number.isFinite(storedRatio) || storedRatio <= 0) return true;
  return Math.abs(storedRatio - nextRatio) / storedRatio > 0.015;
}
