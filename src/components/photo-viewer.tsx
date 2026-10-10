"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadHref } from "@/lib/download-all";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  placeContainedPhoto,
  preloadPhotoSrcs,
  replaceViewerUrl,
  stepPhotoIndex,
  swipeStep,
  VIEWER_CAPTION_GAP_PX,
  VIEWER_CAPTION_LINE_HEIGHT,
  viewerBackdropColor,
  viewerCaption,
  viewerCountLabel,
  viewerImageRatio,
  viewerLayerStyle,
  viewerOriginalSrc,
  viewerPhotoFrameWidth,
  viewerPlaceholderSrc,
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
  const captionRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Index is the only source of truth. initialId seeds it and is not applied again:
  // the URL mirrors the index, and a late router restore must not skip or rewind a tap.
  const [index, setIndex] = useState(() => indexOfPhoto(photos, initialId));
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [naturalRatio, setNaturalRatio] = useState<{ id: string; width: number; height: number } | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [captionHeight, setCaptionHeight] = useState(0);
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
  const frameWidth = ratio ? viewerPhotoFrameWidth(ratio.width, ratio.height) : null;
  const placed =
    stageSize && ratio && captionHeight > 0
      ? placeContainedPhoto(
          stageSize.width,
          stageSize.height,
          ratio.width,
          ratio.height,
          captionHeight + VIEWER_CAPTION_GAP_PX,
        )
      : null;
  const layoutMode = placed ? "pixels" : "css";

  const stepBy = (direction: -1 | 1) => {
    setIndex((current) => stepPhotoIndex(current, photos.length, direction));
  };

  const onReady = useCallback((id: string, width: number, height: number) => {
    setNaturalRatio((current) =>
      current && current.id === id && current.width === width && current.height === height
        ? current
        : { id, width, height },
    );
  }, []);

  useLayoutEffect(() => {
    const node = document.createElement("div");
    node.setAttribute("data-photo-viewer-host", "");
    document.documentElement.appendChild(node);
    // The host has to exist before this layer can portal into it. Strict mode
    // runs the cleanup and creates a replacement before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal host is created once on mount
    setHost(node);
    return () => node.remove();
  }, []);

  useEffect(() => {
    if (!photoId) return;
    replaceViewerUrl(photoViewerHref(basePath, photoId));
  }, [basePath, photoId]);

  const preloadKey = preloadPhotoSrcs(photos, safeIndex).join("|");
  useEffect(() => {
    if (!preloadKey) return;
    for (const src of preloadKey.split("|")) {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
    }
  }, [preloadKey]);

  useEffect(() => {
    const stage = frameRef.current;
    const captionNode = captionRef.current;
    if (!stage) return;
    const measure = () => {
      const box = stage.getBoundingClientRect();
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      setStageSize((current) =>
        current && current.width === width && current.height === height ? current : { width, height },
      );
      if (!captionNode) return;
      const nextHeight = Math.round(captionNode.getBoundingClientRect().height);
      setCaptionHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (captionNode) observer.observe(captionNode);
    return () => observer.disconnect();
  }, [host, photoId, layoutMode]);

  useLayoutEffect(() => {
    if (!host) return;
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
    // Freeze the scrolled page. The viewer lives in a host beside body, so this
    // fixed body is not the viewer's containing block and cannot shift it.
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    const stopGesture = (event: Event) => {
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
  }, [host]);

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

  const captionStyle = {
    lineHeight: VIEWER_CAPTION_LINE_HEIGHT,
  };

  const layer = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] flex h-dvh min-h-dvh w-full touch-none flex-col overflow-hidden overscroll-none"
      style={viewerLayerStyle()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-photo-viewer=""
      data-photo-index={safeIndex}
      data-photo-id={photo.id}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundColor: viewerBackdropColor() }}
        data-photo-backdrop=""
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="relative flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
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
        <div className="relative min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]">
          <div
            ref={frameRef}
            className="absolute inset-0 touch-none select-none"
            style={{ containerType: "size" }}
            data-photo-stage=""
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {placed ? (
              <>
                <Caption
                  ref={captionRef}
                  titleId={titleId}
                  filename={photo.filename}
                  countLabel={countLabel}
                  style={{
                    ...captionStyle,
                    top: placed.top - VIEWER_CAPTION_GAP_PX - captionHeight,
                  }}
                />
                <div
                  data-photo-frame=""
                  data-photo-image=""
                  className="absolute z-10 overflow-hidden"
                  style={{ left: placed.left, top: placed.top, width: placed.width, height: placed.height }}
                >
                  <ViewerStill key={photo.id} photo={photo} active onReady={onReady} />
                </div>
              </>
            ) : (
              <div
                data-photo-frame=""
                className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                style={
                  frameWidth && ratio
                    ? { aspectRatio: `${ratio.width} / ${ratio.height}`, width: frameWidth }
                    : { width: "100%", height: "100%" }
                }
              >
                <Caption
                  ref={captionRef}
                  titleId={titleId}
                  filename={photo.filename}
                  countLabel={countLabel}
                  style={{
                    ...captionStyle,
                    bottom: `calc(100% + ${VIEWER_CAPTION_GAP_PX}px)`,
                  }}
                />
                <div data-photo-image="" className="absolute inset-0 overflow-hidden">
                  <ViewerStill key={photo.id} photo={photo} active onReady={onReady} />
                </div>
              </div>
            )}
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
      <p className="sr-only">{caption}</p>
    </div>
  );

  // Host is a sibling of <body>. The scroll lock pins body, and this layer
  // stays on the viewport instead of moving with that pinned body.
  if (host) return createPortal(layer, host);
  return layer;
}

function Caption({
  ref,
  titleId,
  filename,
  countLabel,
  style,
}: {
  ref: React.Ref<HTMLDivElement>;
  titleId: string;
  filename: string;
  countLabel: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      ref={ref}
      data-photo-caption=""
      className="pointer-events-none absolute left-1/2 z-30 flex w-max max-w-[calc(100cqw-13rem)] -translate-x-1/2 items-center justify-center gap-2"
      style={style}
      aria-live="polite"
    >
      <p
        id={titleId}
        data-photo-filename=""
        title={filename}
        className="min-w-0 truncate text-center text-xl font-semibold text-white sm:text-2xl lg:text-3xl"
        style={{ lineHeight: VIEWER_CAPTION_LINE_HEIGHT }}
      >
        {filename}
      </p>
      <p
        data-photo-count=""
        className="shrink-0 text-xs text-white/70 tabular-nums sm:text-sm"
        style={{ lineHeight: VIEWER_CAPTION_LINE_HEIGHT }}
      >
        {countLabel}
      </p>
    </div>
  );
}

export function ViewerStill({
  photo,
  active,
  onReady,
}: {
  photo: ViewerPhoto;
  active: boolean;
  onReady?: (id: string, width: number, height: number) => void;
}) {
  const placeholder = viewerPlaceholderSrc(photo);
  const original = viewerOriginalSrc(photo);
  const localRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = localRef.current;
    if (!image) return;
    let cancelled = false;
    const publish = () => {
      if (cancelled || !image.isConnected) return;
      if (image.getAttribute("src") !== original) return;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      onReady?.(photo.id, image.naturalWidth, image.naturalHeight);
    };
    image.addEventListener("load", publish);
    if (image.complete) publish();
    return () => {
      cancelled = true;
      image.removeEventListener("load", publish);
    };
  }, [onReady, original, photo.id]);

  return (
    <>
      {placeholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          draggable={false}
          data-photo-id={photo.id}
          data-photo-thumb=""
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
        />
      ) : null}
      {/* Both layers fill the current frame only. The previous photo is unmounted, not stacked. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={localRef}
        src={original}
        alt={active ? photo.filename : ""}
        draggable={false}
        decoding="async"
        data-photo-id={photo.id}
        data-photo-original=""
        className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
      />
    </>
  );
}
