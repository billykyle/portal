export type ViewerPhoto = {
  id: string;
  url: string;
  filename: string;
  thumbUrl?: string;
};

export function photoViewerHref(basePath: string, id?: string) {
  return id ? `${basePath}?view=${id}` : basePath;
}

export function indexOfPhoto(photos: Array<{ id: string }>, viewId: string) {
  const index = photos.findIndex((photo) => photo.id === viewId);
  return index >= 0 ? index : 0;
}

export function clampPhotoIndex(index: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

export function stepPhotoIndex(index: number, total: number, delta: -1 | 1) {
  return clampPhotoIndex(index + delta, total);
}

/** Current ±1, plus one extra ahead so a fast swipe already has bytes. */
export function preloadPhotoIndexes(index: number, total: number) {
  const found = new Set<number>();
  for (const offset of [-1, 1, 2]) {
    const next = index + offset;
    if (next >= 0 && next < total) found.add(next);
  }
  return [...found].sort((a, b) => a - b);
}

/** Lightbox and Download share this file. Grid tiles use the thumb instead. */
export function viewerOriginalSrc(photo: Pick<ViewerPhoto, "url">) {
  return photo.url;
}

/** Low-res stand-in while the original loads. Omitted when it is the same file. */
export function viewerPlaceholderSrc(photo: Pick<ViewerPhoto, "url" | "thumbUrl">) {
  const thumb = photo.thumbUrl;
  if (!thumb || thumb === photo.url) return null;
  return thumb;
}

/** Neighbor slides preload the original, the same URL Download uses. */
export function preloadPhotoSrcs(photos: Array<Pick<ViewerPhoto, "url">>, index: number) {
  return preloadPhotoIndexes(index, photos.length).flatMap((next) => {
    const src = photos[next]?.url;
    return src ? [src] : [];
  });
}

export function shouldRenderPhotoSlide(slideIndex: number, activeIndex: number) {
  return Math.abs(slideIndex - activeIndex) <= 1;
}

/**
 * Swipe left (negative delta) advances. A short, fast flick or an 18%
 * drag commits; otherwise the frame springs back.
 */
export function swipeStep(deltaX: number, elapsedMs: number, width: number): -1 | 0 | 1 {
  if (width <= 0 || deltaX === 0) return 0;
  const distance = Math.abs(deltaX);
  const velocity = elapsedMs > 0 ? distance / elapsedMs : 0;
  const passed = distance > width * 0.18 || (distance > 36 && velocity > 0.45);
  if (!passed) return 0;
  return deltaX < 0 ? 1 : -1;
}

export function resistedDrag(deltaX: number, index: number, total: number) {
  const atStart = index <= 0 && deltaX > 0;
  const atEnd = index >= total - 1 && deltaX < 0;
  if (atStart || atEnd) return deltaX * 0.25;
  return deltaX;
}

export function viewerCountLabel(index: number, total: number) {
  return `${index + 1} / ${total}`;
}

export function viewerCaption(filename: string, index: number, total: number) {
  return `${viewerCountLabel(index, total)}, ${filename}`;
}
