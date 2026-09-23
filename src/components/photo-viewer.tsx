"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  preloadPhotoSrcs,
  resistedDrag,
  shouldRenderPhotoSlide,
  swipeStep,
  viewerCaption,
  viewerCountLabel,
  viewerOriginalSrc,
  viewerPlaceholderSrc,
  type ViewerPhoto,
} from "@/lib/photo-viewer";

const SNAP_MS = 200;

export function PhotoViewer({
  photos,
  initialId,
  basePath,
}: {
  photos: ViewerPhoto[];
  initialId: string;
  basePath: string;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef(0);
  const indexRef = useRef(indexOfPhoto(photos, initialId));
  const widthRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startAt: number;
    axis: "pending" | "x" | "none";
  } | null>(null);

  const [index, setIndex] = useState(() => indexOfPhoto(photos, initialId));
  const [width, setWidth] = useState(0);

  const photo = photos[index];
  const total = photos.length;
  const countLabel = viewerCountLabel(index, total);
  const caption = photo ? viewerCaption(photo.filename, index, total) : "";
  const closeHref = photoViewerHref(basePath);
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const paint = useCallback((nextIndex: number, offset: number, withSnap: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    const x = -nextIndex * widthRef.current + offset;
    track.style.transition = withSnap ? `transform ${SNAP_MS}ms ease-out` : "none";
    track.style.transform = widthRef.current > 0 ? `translate3d(${x}px, 0, 0)` : "none";
  }, []);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    widthRef.current = frame.clientWidth;
    setWidth(frame.clientWidth);
    paint(indexRef.current, 0, false);
  }, [paint]);

  useEffect(() => {
    measure();
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(snapTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!photo) return;
    const href = photoViewerHref(basePath, photo.id);
    window.history.replaceState(window.history.state, "", href);
  }, [basePath, photo]);

  useEffect(() => {
    for (const src of preloadPhotoSrcs(photos, index)) {
      const image = new Image();
      image.src = src;
    }
  }, [index, photos]);

  const snapTo = useCallback(
    (nextIndex: number) => {
      const target = clampPhotoIndex(nextIndex, total);
      window.clearTimeout(snapTimer.current);
      indexRef.current = target;
      setIndex(target);
      paint(target, 0, true);
      snapTimer.current = window.setTimeout(() => {
        paint(target, 0, false);
      }, SNAP_MS);
    },
    [paint, total],
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startAt: performance.now(),
      axis: "pending",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(indexRef.current, 0, false);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.axis === "pending") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "none";
      if (drag.axis === "none") return;
    }
    if (drag.axis !== "x") return;
    event.preventDefault();
    paint(indexRef.current, resistedDrag(dx, indexRef.current, total), false);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.axis !== "x") {
      paint(indexRef.current, 0, false);
      return;
    }
    const step = swipeStep(event.clientX - drag.startX, performance.now() - drag.startAt, widthRef.current);
    snapTo(indexRef.current + step);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        router.push(closeHref);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        snapTo(indexRef.current + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        snapTo(indexRef.current - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router, snapTo]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={caption}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={closeHref} className="shrink-0 text-sm text-white">
          Close
        </Link>
        <div className="min-w-0 flex-1 px-3 text-center" aria-live="polite">
          <p className="text-[15px] font-medium leading-tight text-white">{countLabel}</p>
          <p className="mt-0.5 truncate text-xs leading-tight text-[#8e8e93]">{photo.filename}</p>
        </div>
        <a href={viewerOriginalSrc(photo)} download={photo.filename} className="shrink-0 text-sm text-white">
          Download
        </a>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={frameRef}
          className="relative h-full min-h-0 touch-none overflow-hidden overscroll-x-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div ref={trackRef} className="flex h-full will-change-transform">
            {photos.map((item, slideIndex) => (
              <div
                key={item.id}
                className="relative flex h-full shrink-0 items-center justify-center px-3"
                style={{ width: width > 0 ? width : "100%" }}
              >
                {shouldRenderPhotoSlide(slideIndex, index) ? (
                  <ViewerStill photo={item} active={slideIndex === index} />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        {canPrev ? (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => snapTo(index - 1)}
            className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-sm text-white lg:flex"
          >
            Prev
          </button>
        ) : null}
        {canNext ? (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => snapTo(index + 1)}
            className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-sm text-white lg:flex"
          >
            Next
          </button>
        ) : null}
      </div>
      <div className="flex justify-between px-2 pb-6 text-sm text-white lg:hidden">
        {canPrev ? (
          <button type="button" onClick={() => snapTo(index - 1)} className="min-h-11 px-3 text-white">
            Previous
          </button>
        ) : (
          <span />
        )}
        {canNext ? (
          <button type="button" onClick={() => snapTo(index + 1)} className="min-h-11 px-3 text-white">
            Next
          </button>
        ) : (
          <span />
        )}
      </div>
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
          className="pointer-events-none absolute inset-0 z-0 m-auto max-h-full max-w-full object-contain px-3"
        />
      ) : null}
      {/* The preview is absolute, so it paints above an in-flow image.
          z-10 keeps the original on top once those bytes arrive. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={original}
        alt={active ? photo.filename : ""}
        draggable={false}
        decoding="async"
        className="relative z-10 min-h-0 min-w-0 max-h-full max-w-full object-contain"
      />
    </>
  );
}
