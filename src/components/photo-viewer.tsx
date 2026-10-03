"use client";

import { useEffect, useRef, useState } from "react";
import { downloadHref } from "@/lib/download-all";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  preloadPhotoSrcs,
  swipeStep,
  viewerCaption,
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
  const caption = photo ? viewerCaption(photo.filename, index, total) : "";
  const closeHref = photoViewerHref(basePath);

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
    function onKey(event: KeyboardEvent) {
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

  const ratio =
    photo.width && photo.height && photo.width > 0 && photo.height > 0
      ? `${photo.width} / ${photo.height}`
      : undefined;

  return (
    <div className="mb-4 flex flex-col gap-3" data-photo-viewer="">
      <div
        ref={frameRef}
        className="relative w-full touch-pan-y select-none"
        style={ratio ? { aspectRatio: ratio } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ViewerStill photo={photo} active />
      </div>
      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain" aria-label="Other photos">
        {photos.map((item, itemIndex) =>
          itemIndex === index ? null : (
            <button
              key={item.id}
              type="button"
              aria-label={item.filename}
              onClick={() => setIndex(itemIndex)}
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbUrl ?? item.url}
                alt=""
                draggable={false}
                className="pointer-events-none h-16 w-24 rounded-md object-cover"
              />
            </button>
          ),
        )}
      </div>
      <a
        href={downloadHref(viewerOriginalSrc(photo))}
        download={photo.filename}
        className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-white px-3 text-sm font-medium text-black"
      >
        Download
      </a>
      <p className="sr-only" aria-live="polite">
        {caption}
      </p>
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
      {/* The preview is absolute, so it paints above an in-flow image.
          z-10 keeps the original on top once those bytes arrive. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={original}
        alt={active ? photo.filename : ""}
        draggable={false}
        decoding="async"
        className="relative z-10 h-auto w-full"
      />
    </>
  );
}
