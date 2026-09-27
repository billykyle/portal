const AUDIO_EXT = /\.(mp3|wav|m4a)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|tif|tiff|svg)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;
const EPISODE_RE = /(?:\b(?:episode|ep)\b\s*#?\s*(\d+)|#(\d+)|\bE(\d+)\b)/i;
const FULL_NAME_RE = /(^|[\\/_\-\s])(full|episode|master)([\\/_\-\s.]|$)/i;
const VERTICAL_NAME_RE = /(?:^|[^\d])9\s*[:x×]\s*16(?:[^\d]|$)|vertical|\bshorts?\b|\breels?\b/i;

export type EpisodeIdentity = {
  heading: string;
  guest: string | null;
  episode: number | null;
};

export type PodcastFile = {
  id: string;
  filename: string;
  type: string;
  sortOrder: number;
  width?: number | null;
  height?: number | null;
};

export type PodcastGroups<T extends PodcastFile> = {
  full: T | null;
  clips: T[];
  audio: T[];
  stills: T[];
};

function stripShootDate(value: string) {
  return value.replace(/^\d{4}-\d{2}-\d{2}\s*[-–—]\s*/, "").trim();
}

function episodeNumber(value: string) {
  const match = value.match(EPISODE_RE);
  if (!match) return null;
  const raw = match[1] || match[2] || match[3];
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function splitGuest(value: string) {
  const withGuest = value.match(/^(.*?)\s+with\s+(.+)$/i);
  if (withGuest?.[1] && withGuest[2]) {
    return { head: withGuest[1].trim(), guest: withGuest[2].trim() };
  }
  const dashed = value.match(/^(.*?)\s+[-–—]\s+(.+)$/);
  if (dashed?.[1] && dashed[2] && episodeNumber(dashed[1]) != null) {
    return { head: dashed[1].trim(), guest: dashed[2].trim() };
  }
  return { head: value.trim(), guest: null as string | null };
}

function identityFrom(source: string, fallbackTitle: string): EpisodeIdentity {
  const stripped = stripShootDate(source);
  const { head, guest } = splitGuest(stripped);
  const episode = episodeNumber(head) ?? episodeNumber(stripped);
  if (episode == null && !guest) {
    return { heading: fallbackTitle.trim() || stripped, guest: null, episode: null };
  }
  return {
    heading: episode != null ? `Episode ${episode}` : head || fallbackTitle.trim(),
    guest,
    episode,
  };
}

/** First still, otherwise the first video poster. Files should already be in shoot order. */
export function podcastCoverUrl(
  files: Array<PodcastFile & { thumbUrl?: string | null }>,
): string | null {
  const ordered = [...files].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.filename.localeCompare(right.filename),
  );
  const still = ordered.find((file) => isStill(file) && file.thumbUrl);
  if (still?.thumbUrl) return still.thumbUrl;
  const video = ordered.find((file) => isVideo(file) && file.thumbUrl);
  return video?.thumbUrl ?? null;
}

/** Episode number and guest from the shoot title or its folder name. */
export function parseEpisodeIdentity(title: string, folderName = ""): EpisodeIdentity {
  const fallback = title.trim() || stripShootDate(folderName) || "Episode";
  const sources = [title, folderName].map((value) => value.trim()).filter(Boolean);
  let best = identityFrom(fallback, fallback);
  for (const source of sources) {
    const parsed = identityFrom(source, fallback);
    if (parsed.episode == null && !parsed.guest) continue;
    best = parsed;
    if (parsed.episode != null) break;
  }
  return best;
}

export function isVerticalClip(file: Pick<PodcastFile, "filename" | "width" | "height">) {
  if (file.width && file.height && file.height > file.width) return true;
  return VERTICAL_NAME_RE.test(file.filename);
}

function isVideo(file: PodcastFile) {
  return file.type === "video" || VIDEO_EXT.test(file.filename);
}

function isAudio(file: PodcastFile) {
  return file.type === "audio" || AUDIO_EXT.test(file.filename);
}

function isStill(file: PodcastFile) {
  if (isVideo(file) || isAudio(file)) return false;
  return file.type === "photo" || file.type === "floor_plan" || IMAGE_EXT.test(file.filename);
}

function area(file: PodcastFile) {
  return (file.width ?? 0) * (file.height ?? 0);
}

function bySize(left: PodcastFile, right: PodcastFile) {
  return area(right) - area(left) || left.sortOrder - right.sortOrder;
}

function isFullEpisodeName(filename: string) {
  return FULL_NAME_RE.test(filename);
}

/**
 * Full episode is a video named full/episode/master, otherwise the largest video.
 * Other videos are clips. Audio and images are their own groups.
 */
export function groupPodcastFiles<T extends PodcastFile>(files: T[]): PodcastGroups<T> {
  const videos = files.filter(isVideo);
  const named = videos.filter((file) => isFullEpisodeName(file.filename));
  const pool = named.length > 0 ? named : videos;
  const full = pool.length > 0 ? [...pool].sort(bySize)[0] : null;
  const clips = videos.filter((file) => file.id !== full?.id);
  const audio = files.filter(isAudio);
  const stills = files.filter(isStill);
  return { full, clips, audio, stills };
}
