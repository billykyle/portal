export type ViewerPhoto = {
  id: string;
  url: string;
  filename: string;
  thumbUrl?: string;
  width?: number | null;
  height?: number | null;
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

/**
 * What the stage `<img>` may paint. The original is shown only after that
 * photo's file has decoded. Until then the cached thumb fills the same box.
 * A photo with no separate thumb has nothing else to show, so the original
 * URL is used and the new element stays blank until it decodes.
 */
export function viewerStageSrc(photo: Pick<ViewerPhoto, "url" | "thumbUrl">, originalReady: boolean) {
  if (originalReady) return viewerOriginalSrc(photo);
  return viewerPlaceholderSrc(photo) ?? viewerOriginalSrc(photo);
}

/** Neighbor slides preload the original, the same URL Download uses. */
export function preloadPhotoSrcs(photos: Array<Pick<ViewerPhoto, "url">>, index: number) {
  return preloadPhotoIndexes(index, photos.length).flatMap((next) => {
    const src = photos[next]?.url;
    return src ? [src] : [];
  });
}

/** Neighbor thumbs, so the next tap already has a decoded stand-in. */
export function preloadStandInSrcs(photos: Array<Pick<ViewerPhoto, "url" | "thumbUrl">>, index: number) {
  return preloadPhotoIndexes(index, photos.length).flatMap((next) => {
    const photo = photos[next];
    if (!photo) return [];
    const src = viewerPlaceholderSrc(photo);
    return src ? [src] : [];
  });
}

/** Only the current photo is mounted. Neighbors are preloaded, not painted. */
export function shouldRenderPhotoSlide(slideIndex: number, activeIndex: number) {
  return slideIndex === activeIndex;
}

/** A decoded frame may paint only when it is still the photo on screen. */
export function shouldPaintViewerImage(requestId: string, currentId: string) {
  return requestId === currentId;
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

/**
 * Backdrop of the full-screen photo viewer.
 * Black at 95% opacity. Flat color, no blur, over the whole viewport.
 */
export const VIEWER_BACKDROP_OPACITY = 0.95;

/** Above the page header (z-10) and the selection bar (z-40), under the nav menu. */
export const VIEWER_Z_INDEX = 60;

export function viewerBackdropColor(opacity = VIEWER_BACKDROP_OPACITY) {
  return `rgb(0 0 0 / ${opacity})`;
}

/**
 * Paint for the viewer layer itself. The color covers that element's border
 * box, so the wash cannot miss the layer the way a `vh`-positioned child can
 * on iOS (the visual viewport and `vh` diverge once the page is scroll-locked).
 * The shadow is the same color outside the box, over the browser-chrome band.
 */
export function viewerBackdropStyle() {
  const color = viewerBackdropColor();
  return {
    backgroundColor: color,
    boxShadow: `0 0 0 100vmax ${color}`,
  };
}

/** Full-viewport layer. `100dvh` tracks the visible screen, including iOS browser chrome. */
export function viewerLayerStyle() {
  return {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100dvh",
    minHeight: "100dvh",
    zIndex: VIEWER_Z_INDEX,
  };
}

/**
 * Line box tall enough for `.jpg` descenders, plus a gap so the photo
 * starts below the text instead of covering it.
 */
export const VIEWER_CAPTION_LINE_HEIGHT = 1.5;
export const VIEWER_CAPTION_GAP_PX = 16;

/**
 * Reel thumbs are 3:2. The phone size is the default; desktop (Tailwind `lg`,
 * 64rem) uses the larger pair. Object-fit is cover, so the box stays 3:2.
 */
export const VIEWER_REEL_THUMB_WIDTH_PX = 60;
export const VIEWER_REEL_THUMB_HEIGHT_PX = 40;
export const VIEWER_REEL_THUMB_DESKTOP_WIDTH_PX = 96;
export const VIEWER_REEL_THUMB_DESKTOP_HEIGHT_PX = 64;
export const VIEWER_REEL_DESKTOP_MIN = "64rem";

export function viewerImageRatio(width?: number | null, height?: number | null) {
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Width of a box that matches `object-contain` (centered) inside a size
 * container. Pair with `aspect-ratio: width / height` so the box's top
 * edge is the photo's rendered top at any frame size.
 */
export function viewerPhotoFrameWidth(imageWidth: number, imageHeight: number) {
  const ratio = viewerImageRatio(imageWidth, imageHeight);
  if (!ratio) return null;
  return `min(100cqw, calc(100cqh * ${ratio.width} / ${ratio.height}))`;
}

/**
 * Caption line plus the gap, in a size container whose font matches the filename.
 * `1lh` is that line, so the reserve stays correct when the type size changes.
 */
export function viewerCaptionReserve() {
  return `${VIEWER_CAPTION_GAP_PX}px + 1lh`;
}

/** The 16px gap under the photo, plus the reel thumb height. */
export function viewerReelReserve() {
  return `${VIEWER_CAPTION_GAP_PX}px + var(--reel-thumb-h)`;
}

/** Filename line, both 16px gaps, and the reel. The centered stack fits in this. */
export function viewerStackReserve() {
  return `${viewerCaptionReserve()} + ${viewerReelReserve()}`;
}

/**
 * Phone and desktop thumb boxes. `--reel-thumb-h` is what the photo frame
 * subtracts, so the reel stays 16px under the photo at both sizes.
 */
export function viewerReelVarsCss() {
  const phone = `--reel-thumb-w:${VIEWER_REEL_THUMB_WIDTH_PX}px;--reel-thumb-h:${VIEWER_REEL_THUMB_HEIGHT_PX}px`;
  const desktop = `--reel-thumb-w:${VIEWER_REEL_THUMB_DESKTOP_WIDTH_PX}px;--reel-thumb-h:${VIEWER_REEL_THUMB_DESKTOP_HEIGHT_PX}px`;
  return `[data-photo-stage]{${phone}}@media (min-width:${VIEWER_REEL_DESKTOP_MIN}){[data-photo-stage]{${desktop}}}`;
}

/**
 * Photo box inside a size container. The width is the contained size after
 * leaving room for the filename above and the reel below, which sit in normal
 * flow in the same centered stack. Nothing measures the photo, so the name
 * and the reel cannot jump when an image loads or the iOS toolbar shows and hides.
 */
export function viewerContainedFrame(imageWidth: number, imageHeight: number) {
  const ratio = viewerImageRatio(imageWidth, imageHeight);
  if (!ratio) return null;
  const reserve = viewerStackReserve();
  return {
    aspectRatio: `${ratio.width} / ${ratio.height}`,
    width: `min(100cqw, calc((100cqh - (${reserve})) * ${ratio.width} / ${ratio.height}))`,
    maxWidth: "100%",
  };
}

/** Largest box of this aspect that fits the stage. Same math as object-fit: contain. */
export function containedPhotoRect(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  if (!(stageWidth > 0 && stageHeight > 0 && imageWidth > 0 && imageHeight > 0)) return null;
  const scale = Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    left: (stageWidth - width) / 2,
    top: (stageHeight - height) / 2,
  };
}

/**
 * Fit the photo in the stage below a reserved filename block so the image
 * never runs into the caption. `captionBlock` is the caption height plus the gap.
 */
export function placeContainedPhoto(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
  captionBlock: number,
) {
  const reserve = Math.max(0, captionBlock);
  const rect = containedPhotoRect(stageWidth, stageHeight - reserve, imageWidth, imageHeight);
  if (!rect) return null;
  return { ...rect, top: rect.top + reserve };
}

/**
 * Update the address bar without notifying the Next.js router.
 * The patched `history.replaceState` restores search params and can
 * write an older photo back over a newer tap.
 */
export function replaceViewerUrl(href: string) {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === href) return;
  const state = window.history.state;
  const native = nativeHistoryReplace();
  if (native) native.call(window.history, state, "", href);
  else window.history.replaceState(state, "", href);
}

let nativeReplace: History["replaceState"] | null = null;

function nativeHistoryReplace() {
  if (nativeReplace) return nativeReplace;
  if (typeof document === "undefined") return null;
  const frame = document.createElement("iframe");
  frame.hidden = true;
  document.documentElement.appendChild(frame);
  nativeReplace = frame.contentWindow?.history.replaceState ?? null;
  frame.remove();
  return nativeReplace;
}

export function viewerCountLabel(index: number, total: number) {
  return `${index + 1} / ${total}`;
}

export function viewerCaption(filename: string, index: number, total: number) {
  return `${viewerCountLabel(index, total)}, ${filename}`;
}
