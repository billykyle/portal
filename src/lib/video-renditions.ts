import { createHash } from "crypto";
import path from "path";
import { shorterSide } from "./video-probe";
import {
  isVideoQuality,
  renditionFilename,
  type VideoDisplaySize,
  type VideoQuality,
} from "./video-playback";

export {
  availableQualities,
  isVideoQuality,
  renditionFilename,
  renditionPlayUrl,
  resolvePlaybackQuality,
  shouldReportDisplaySize,
  videoFrameStyle,
  VIDEO_FRAME_MAX_HEIGHT,
  VIDEO_QUALITIES,
} from "./video-playback";
export type { PlaybackQuality, QualityChoice, VideoDisplaySize, VideoQuality } from "./video-playback";

/** Hidden folder on the share. Sync already skips names that start with "." */
export const RENDITION_DIR = ".portal-renditions";

export function renditionNasPath(originalNasPath: string, quality: VideoQuality) {
  const normalized = originalNasPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 20);
  const folder = dir ? `${dir}/${RENDITION_DIR}` : RENDITION_DIR;
  return `${folder}/${hash}-${quality}.mp4`;
}

/**
 * Renditions to build. Targets are the shorter side (1280×720 and 1920×1080,
 * or 720×1280 and 1080×1920 for a vertical video). Never upscale.
 */
export function renditionTargets(size: VideoDisplaySize): VideoQuality[] {
  const side = shorterSide(size);
  const targets: VideoQuality[] = [];
  if (side > 1080) targets.push("1080");
  if (side > 720) targets.push("720");
  return targets;
}

export function ffmpegRenditionArgs(input: string, output: string, quality: VideoQuality, withAudio: boolean) {
  const target = quality === "720" ? 720 : 1080;
  const scale = `scale=w='if(gte(iw,ih),-2,min(${target},iw))':h='if(gte(iw,ih),min(${target},ih),-2)'`;
  const args = ["-y", "-i", input, "-map", "0:v:0"];
  if (withAudio) args.push("-map", "0:a:0?");
  args.push(
    "-vf",
    scale,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
  );
  if (withAudio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  else args.push("-an");
  args.push(output);
  return args;
}

export function displaySizeFromFfprobe(data: unknown): VideoDisplaySize | null {
  if (!data || typeof data !== "object") return null;
  const streams = (data as { streams?: unknown }).streams;
  if (!Array.isArray(streams)) return null;
  const video = streams.find((stream) => {
    if (!stream || typeof stream !== "object") return false;
    const kind = (stream as { codec_type?: string }).codec_type;
    return kind == null || kind === "video";
  }) as { width?: unknown; height?: unknown; tags?: Record<string, string>; side_data_list?: Array<Record<string, unknown>> } | undefined;
  if (!video) return null;
  const width = Number(video.width);
  const height = Number(video.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16) return null;
  const rotation = rotationDegrees(video);
  const turned90 = rotation != null && Math.abs(Math.abs(rotation) - 90) < 1;
  const turned270 = rotation != null && Math.abs(Math.abs(rotation) - 270) < 1;
  const quarter = turned90 || turned270;
  const size = quarter
    ? { width: Math.round(height), height: Math.round(width) }
    : { width: Math.round(width), height: Math.round(height) };
  return size.width > 8000 || size.height > 8000 ? null : size;
}

function rotationDegrees(video: { tags?: Record<string, string>; side_data_list?: Array<Record<string, unknown>> }) {
  const side = video.side_data_list?.find((entry) => {
    const type = String(entry.side_data_type ?? "");
    return /display\s*matrix|rotation/i.test(type) && entry.rotation != null;
  });
  if (side && Number.isFinite(Number(side.rotation))) return Number(side.rotation);
  const tag = video.tags?.rotate ?? video.tags?.rotation;
  if (tag != null && Number.isFinite(Number(tag))) return Number(tag);
  return null;
}

/** Map a NAS absolute path onto a local mount of the same share. */
export function nasPathToLocal(nasPath: string, fsRoot: string, prefix: string) {
  const root = path.resolve(fsRoot);
  let rel = nasPath.trim().replace(/\\/g, "/");
  const normalizedPrefix = prefix.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalizedPrefix) {
    if (rel !== normalizedPrefix && !rel.startsWith(`${normalizedPrefix}/`)) return null;
    rel = rel.slice(normalizedPrefix.length);
  }
  rel = rel.replace(/^\/+/, "");
  if (!rel || rel.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  const local = path.resolve(root, ...rel.split("/"));
  if (local !== root && !local.startsWith(root + path.sep)) return null;
  return local;
}

export function selectServedVideo(input: {
  download: boolean;
  rendition: string | null;
  original: { path: string; filename: string };
  renditions: readonly { quality: string; path: string }[];
}): { path: string; filename: string; kind: "original" | "rendition" } {
  if (!input.download && isVideoQuality(input.rendition)) {
    const match = input.renditions.find((item) => item.quality === input.rendition);
    if (match?.path) {
      return {
        path: match.path,
        filename: renditionFilename(input.original.filename, input.rendition),
        kind: "rendition",
      };
    }
  }
  return { path: input.original.path, filename: input.original.filename, kind: "original" };
}
