"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { downloadHref } from "@/lib/download-all";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  preloadPhotoSrcs,
  swipeStep,
  viewerBackdropColor,
  viewerCaption,
  viewerCountLabel,
  viewerOriginalSrc,
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
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startAt: number;
    axis: "pending" | "x" | "none";
  } | null>(null);
  const [index, setIndex] = useState(() => indexOfPhoto(photos, initialId));
  const [seenId, setSeenId] = useState(initialId);
  if (seenId !== initialId) {
    setSeenId(initialId);
    setIndex(indexOfPhoto(photos, initialId));
  }

  const photo = photos[index];
  const photoId = photo?.id;
  const total = photos.length;
  const countLabel = viewerCountLabel(index, total);
  const caption = photo ? viewerCaption(photo.filename, index, total) : "";
  const closeHref = photoViewerHref(basePath);
  const canPrev = index > 0;
  const canNext = index < total - 1;

  useEffect(() => {
    if (!photoId) return;
    window.history.replaceState(window.history.state, "", photoViewerHref(basePath, photoId));
  }, [basePath, photoId]);

  useEffect(() => {
    for (const src of preloadPhotoSrcs(photos, index)) {
      const image = new Image();
      image.src = src;
    }
  }, [index, photos]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

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
        setIndex((current) => clampPhotoIndex(current + 1, total));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => clampPhotoIndex(current - 1, total));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, total]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
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
    setIndex((current) => clampPhotoIndex(current + step, total));
  }

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-photo-viewer=""
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
          <div
            className="pointer-events-none absolute inset-x-[6.5rem] top-[max(0.75rem,env(safe-area-inset-top))] bottom-3 flex items-center justify-center gap-2"
            aria-live="polite"
          >
            <p
              id={titleId}
              title={photo.filename}
              className="min-w-0 truncate text-center text-xl font-semibold leading-none text-white sm:text-2xl lg:text-3xl"
            >
              {photo.filename}
            </p>
            <p className="shrink-0 text-xs leading-none text-white/70 tabular-nums sm:text-sm">{countLabel}</p>
          </div>
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
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <ViewerStill photo={photo} active />
          </div>
          <button
            type="button"
            aria-label="Previous photo"
            disabled={!canPrev}
            onClick={() => setIndex((current) => clampPhotoIndex(current - 1, total))}
            className="absolute top-1/2 left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg disabled:opacity-30 lg:left-6"
          >
            <ChevronLeft aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={!canNext}
            onClick={() => setIndex((current) => clampPhotoIndex(current + 1, total))}
            className="absolute top-1/2 right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg disabled:opacity-30 lg:right-6"
          >
            <ChevronRight aria-hidden="true" className="size-7" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <p className="sr-only">{caption}</p>
    </div>
  );
}

export function ViewerStill({ photo, active }: { photo: ViewerPhoto; active: boolean }) {
  const placeholder = viewerPlaceholderSrc(photo);
  const original = viewerOriginalSrc(photo);
  return (
    <>
      {placeholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full object-contain"
        />
      ) : null}
      {/* Both layers fill the frame. z-10 keeps the original above the thumb once it arrives. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={original}
        alt={active ? photo.filename : ""}
        draggable={false}
        decoding="async"
        className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
      />
    </>
  );
}
