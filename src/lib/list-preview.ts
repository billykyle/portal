const IMAGE = /\.(jpe?g|png|webp|gif|avif|heic)(?:$|[?#])/i;

/** Low-res thumb for a list row. Videos and other files without one return null. */
export function listPreviewSrc(item: { url?: string; thumbUrl?: string | null }) {
  const thumb = item.thumbUrl?.trim();
  if (thumb && (thumb.includes("/thumb") || IMAGE.test(thumb))) return thumb;
  const url = item.url?.trim();
  if (url && IMAGE.test(url)) return url;
  return null;
}
