const IMAGE = /\.(jpe?g|png|webp|gif|avif|heic)(?:$|[?#])/i;

const LIST_THUMB = "inline-block size-12 shrink-0 overflow-hidden rounded-md bg-[#1c1c1e]";
const LIST_THUMB_RATIO = "inline-block h-12 w-auto shrink-0 overflow-hidden rounded-md bg-[#1c1c1e]";

/** Low-res thumb for a list row. Videos and other files without one return null. */
export function listPreviewSrc(item: { url?: string; thumbUrl?: string | null }) {
  const thumb = item.thumbUrl?.trim();
  if (thumb && (thumb.includes("/thumb") || IMAGE.test(thumb))) return thumb;
  const url = item.url?.trim();
  if (url && IMAGE.test(url)) return url;
  return null;
}

/**
 * List-row thumb box. Photos stay a 48px square.
 * A video with a known size uses that ratio at the same 48px height, so 9:16
 * stays narrow and 16:9 stays wide without a square crop.
 */
export function listRowFrame(width?: number | null, height?: number | null): {
  className: string;
  style?: { aspectRatio: string };
} {
  if (!width || !height || width <= 0 || height <= 0) {
    return { className: LIST_THUMB };
  }
  return {
    className: LIST_THUMB_RATIO,
    style: { aspectRatio: `${width} / ${height}` },
  };
}
