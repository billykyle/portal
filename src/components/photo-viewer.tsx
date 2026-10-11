"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadHref } from "@/lib/download-all";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  preloadPhotoSrcs,
  preloadStandInSrcs,
  replaceViewerUrl,
  shouldPaintViewerImage,
  stepPhotoIndex,
  swipeStep,
  VIEWER_CAPTION_GAP_PX,
  VIEWER_CAPTION_LINE_HEIGHT,
  viewerBackdropStyle,
  viewerCaption,
  viewerContainedFrame,
  viewerCountLabel,
  viewerImageRatio,
  viewerLayerStyle,
  viewerOriginalSrc,
  viewerPlaceholderSrc,
  viewerReelVarsCss,
  viewerStackReserve,
  viewerStageSrc,
  type ViewerPhoto,
} from "@/lib/photo-viewer";

export function PhotoViewer({
  photos,
  initialId,
  basePath,
}: {
  photos: ViewerPhoto[];
  initialId: string;
  basePath: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLAnchorElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Index is the only source of truth. initialId seeds it and is not applied again:
  // the URL mirrors the index, and a late router restore must not skip or rewind a tap.
  const [index, setIndex] = useState(() => indexOfPhoto(photos, initialId));
  const [portalReady, setPortalReady] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState<{ id: string; width: number; height: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startAt: number;
    axis: "pending" | "x" | "none";
  } | null>(null);

  const safeIndex = clampPhotoIndex(index, photos.length);
  if (safeIndex !== index) setIndex(safeIndex);

  const photo = photos[safeIndex];
  const photoId = photo?.id;
  const total = photos.length;
  const countLabel = viewerCountLabel(safeIndex, total);
  const caption = photo ? viewerCaption(photo.filename, safeIndex, total) : "";
  const closeHref = photoViewerHref(basePath);
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < total - 1;
  const metaRatio = photo ? viewerImageRatio(photo.width, photo.height) : null;
  const renderedRatio =
    photo && naturalRatio?.id === photo.id ? viewerImageRatio(naturalRatio.width, naturalRatio.height) : null;
  const ratio = renderedRatio ?? metaRatio;
  const frame = ratio ? viewerContainedFrame(ratio.width, ratio.height) : null;

  const stepBy = (direction: -1 | 1) => {
    setIndex((current) => stepPhotoIndex(current, photos.length, direction));
  };

  const showIndex = (next: number) => {
    setIndex(clampPhotoIndex(next, photos.length));
  };

  const onReady = useCallback((id: string, width: number, height: number) => {
    setNaturalRatio((current) => {
      // A late decode for a photo that is no longer on screen must not resize this frame.
      if (!shouldPaintViewerImage(id, photo?.id ?? id)) return current;
      return current && current.id === id && current.width === width && current.height === height
        ? current
        : { id, width, height };
    });
  }, [photo?.id]);

  useLayoutEffect(() => {
    // Portal onto body before paint. A disposable host gets removed during
    // the dev remount and drops the open lightbox for a frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client portal
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!photoId) return;
    replaceViewerUrl(photoViewerHref(basePath, photoId));
  }, [basePath, photoId]);

  const preloadKey = [...preloadPhotoSrcs(photos, safeIndex), ...preloadStandInSrcs(photos, safeIndex)].join("|");
  useEffect(() => {
    if (!preloadKey) return;
    const images: HTMLImageElement[] = [];
    for (const src of preloadKey.split("|")) {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      images.push(image);
    }
    return () => {
      for (const image of images) image.src = "";
    };
  }, [preloadKey]);

  useLayoutEffect(() => {
    const reel = reelRef.current;
    if (!reel || !photoId) return;
    const center = () => {
      const thumb = [...reel.querySelectorAll<HTMLElement>("[data-reel-id]")].find(
        (node) => node.dataset.reelId === photoId,
      );
      if (!thumb) return;
      const reelBox = reel.getBoundingClientRect();
      const thumbBox = thumb.getBoundingClientRect();
      const delta = thumbBox.left + thumbBox.width / 2 - (reelBox.left + reelBox.width / 2);
      if (Math.abs(delta) < 1) return;
      reel.scrollTo({ left: reel.scrollLeft + delta, behavior: "auto" });
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(reel);
    return () => observer.disconnect();
  }, [photoId, portalReady]);

  useLayoutEffect(() => {
    if (!portalReady) return;
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      rootOverscroll: root.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };
    // Freeze the scrolled page in place. The viewer is position:fixed, so it
    // stays on the viewport while body is pinned. touch-action stays alone:
    // `none` on body would also freeze the reel, because it intersects with
    // every descendant.
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    const stopGesture = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && reelRef.current?.contains(target)) return;
      if (event.cancelable) event.preventDefault();
    };
    // Non-passive so a vertical swipe cannot scroll the page under the fixed layer.
    document.addEventListener("touchmove", stopGesture, { passive: false });
    document.addEventListener("wheel", stopGesture, { passive: false });
    closeRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("touchmove", stopGesture);
      document.removeEventListener("wheel", stopGesture);
      root.style.overflow = previous.rootOverflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      body.style.touchAction = previous.bodyTouchAction;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [portalReady]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") {
        window.location.assign(closeHref);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => stepPhotoIndex(current, photos.length, 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => stepPhotoIndex(current, photos.length, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, photos.length]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button, a")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startAt: performance.now(),
      axis: "pending",
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.axis === "pending") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "none";
      if (drag.axis === "x") event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (drag.axis === "x") event.preventDefault();
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.axis !== "x") return;
    const step = swipeStep(
      event.clientX - drag.startX,
      performance.now() - drag.startAt,
      frameRef.current?.clientWidth ?? 0,
    );
    if (step === 0) return;
    stepBy(step);
  }

  if (!photo) return null;

  const layer = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] flex h-dvh min-h-dvh w-full flex-col overscroll-none"
      style={{ ...viewerBackdropStyle(), ...viewerLayerStyle() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-photo-viewer=""
      data-photo-backdrop=""
      data-photo-index={safeIndex}
      data-photo-id={photo.id}
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header
          data-photo-header=""
          className="relative flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
        >
          <a
            ref={closeRef}
            href={closeHref}
            aria-label="Close"
            className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-white"
          >
            <X aria-hidden="true" className="size-6" strokeWidth={2.25} />
          </a>
          <a
            href={downloadHref(viewerOriginalSrc(photo))}
            download={photo.filename}
            className="relative z-10 inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-white px-3 text-sm font-medium text-black"
          >
            Download
          </a>
        </header>
        <div className="relative min-h-0 flex-1">
          <div
            ref={frameRef}
            className="absolute inset-0 flex select-none flex-col items-center justify-center text-xl sm:text-2xl lg:text-3xl"
            style={{
              containerType: "size",
              lineHeight: VIEWER_CAPTION_LINE_HEIGHT,
              // Home-indicator inset. A short stack stays centered above it; a tall one stops here.
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            data-photo-stage=""
          >
            {/* Swipes land here. It is not an ancestor of the reel, so touch-action:none does not freeze the reel. */}
            <div
              className="absolute inset-0 z-0 touch-none"
              aria-hidden="true"
              data-photo-gesture=""
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div
              data-photo-stack=""
              className="pointer-events-none relative z-10 flex w-full max-w-full shrink-0 flex-col items-center"
            >
              <Caption titleId={titleId} filename={photo.filename} countLabel={countLabel} />
              <div
                data-photo-frame=""
                data-photo-image=""
                className="relative max-w-full shrink-0 overflow-hidden"
                style={frame ?? undefined}
              >
                <ViewerStill key={photo.id} photo={photo} active layout={frame ? "fill" : "intrinsic"} onReady={onReady} />
              </div>
              <PhotoReel ref={reelRef} photos={photos} index={safeIndex} onSelect={showIndex} />
            </div>
          </div>
          <button
            type="button"
            aria-label="Previous photo"
            disabled={!canPrev}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => stepBy(-1)}
            className="absolute top-1/2 left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg disabled:opacity-30 lg:left-6"
          >
            <ChevronLeft aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={!canNext}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => stepBy(1)}
            className="absolute top-1/2 right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg disabled:opacity-30 lg:right-6"
          >
            <ChevronRight aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <style>{viewerReelVarsCss()}</style>
      <p className="sr-only">{caption}</p>
    </div>
  );

  if (portalReady && typeof document !== "undefined") return createPortal(layer, document.body);
  return layer;
}

function Caption({
  titleId,
  filename,
  countLabel,
}: {
  titleId: string;
  filename: string;
  countLabel: string;
}) {
  return (
    <div
      data-photo-caption=""
      className="flex w-full max-w-full shrink-0 items-center justify-center gap-2 px-4"
      style={{ marginBottom: VIEWER_CAPTION_GAP_PX }}
      aria-live="polite"
    >
      <p
        id={titleId}
        data-photo-filename=""
        title={filename}
        className="m-0 min-w-0 truncate text-center text-xl font-semibold text-white sm:text-2xl lg:text-3xl"
        style={{ lineHeight: VIEWER_CAPTION_LINE_HEIGHT }}
      >
        {filename}
      </p>
      <p
        data-photo-count=""
        className="m-0 shrink-0 text-xs text-white/70 tabular-nums sm:text-sm"
        style={{ lineHeight: VIEWER_CAPTION_LINE_HEIGHT }}
      >
        {countLabel}
      </p>
    </div>
  );
}

function PhotoReel({
  ref,
  photos,
  index,
  onSelect,
}: {
  ref: React.Ref<HTMLDivElement>;
  photos: ViewerPhoto[];
  index: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      ref={ref}
      data-photo-reel=""
      aria-label="Photos"
      className="pointer-events-auto relative z-20 w-full min-w-0 shrink-0 touch-pan-x overflow-x-auto overscroll-x-contain select-none"
      style={{ marginTop: VIEWER_CAPTION_GAP_PX, touchAction: "pan-x" }}
    >
      <div className="flex w-max gap-1.5" style={{ paddingInline: "calc(50% - var(--reel-thumb-w) / 2)" }}>
        {photos.map((item, itemIndex) => {
          const active = itemIndex === index;
          const thumb = viewerPlaceholderSrc(item);
          return (
            <button
              key={item.id}
              type="button"
              data-reel-id={item.id}
              aria-current={active ? "true" : undefined}
              aria-label={item.filename}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(itemIndex)}
              className={`box-border shrink-0 overflow-hidden border-2 bg-white/10 ${
                active ? "border-white opacity-100" : "border-transparent opacity-40"
              }`}
              style={{ width: "var(--reel-thumb-w)", height: "var(--reel-thumb-h)" }}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt=""
                  draggable={false}
                  decoding="async"
                  loading={active ? "eager" : "lazy"}
                  data-reel-thumb=""
                  className="pointer-events-none h-full w-full object-cover"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ViewerStill({
  photo,
  active,
  onReady,
  layout = "fill",
}: {
  photo: ViewerPhoto;
  active: boolean;
  onReady?: (id: string, width: number, height: number) => void;
  layout?: "fill" | "intrinsic";
}) {
  const original = viewerOriginalSrc(photo);
  const [readyId, setReadyId] = useState<string | null>(null);
  const originalReady = readyId === photo.id;
  const src = viewerStageSrc(photo, originalReady);
  const showingOriginal = src === original;
  const limit: React.CSSProperties = {
    maxWidth: "100%",
    width: "auto",
    height: "auto",
    maxHeight: `calc(100cqh - (${viewerStackReserve()}))`,
  };

  useLayoutEffect(() => {
    // Decode off the DOM. WebKit keeps the previous bitmap when `src` changes
    // on an <img> that has already painted, so this element is never that node.
    let activeLoad = true;
    const image = new Image();
    image.decoding = "async";
    const publish = () => {
      // Cleanup runs before the next photo's effect, so a decode that finishes
      // late cannot mark that older photo ready or report its size.
      if (!activeLoad) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      setReadyId(photo.id);
      onReady?.(photo.id, image.naturalWidth, image.naturalHeight);
    };
    image.addEventListener("load", publish);
    image.src = original;
    if (image.complete) publish();
    return () => {
      activeLoad = false;
      image.removeEventListener("load", publish);
      image.src = "";
    };
  }, [onReady, original, photo.id]);

  return (
    // A new photo id mounts a new element. The previous photo is not left in the tree.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={photo.id}
      src={src}
      alt={active ? photo.filename : ""}
      draggable={false}
      decoding="async"
      data-photo-id={photo.id}
      data-photo-original={showingOriginal ? "" : undefined}
      data-photo-thumb={showingOriginal ? undefined : ""}
      className={
        layout === "fill"
          ? "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
          : "pointer-events-none relative z-10 block max-w-full object-contain"
      }
      style={layout === "fill" ? undefined : limit}
    />
  );
}
