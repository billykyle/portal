"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { acquirePreviewSlot, PREVIEW_NEAR_MARGIN } from "@/lib/preview-queue";
import { THUMB_RETRY_LIMIT, withThumbRetry } from "@/lib/thumb-retry";

export function MediaTile({
  href,
  src,
  filename,
  downloadUrl,
  contain,
  ratio = "square",
  eager = true,
}: {
  href: string;
  src: string;
  filename: string;
  downloadUrl: string;
  contain: boolean;
  ratio?: "square" | "3/2";
  /** In the first HTML so the opening rows start before hydration. */
  eager?: boolean;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [manualRetry, setManualRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(eager);
  const [slotReady, setSlotReady] = useState(eager);
  const aspectClass = ratio === "3/2" ? "aspect-[3/2]" : "aspect-square";
  const fitClass = contain ? "object-contain p-1" : "object-cover";

  useEffect(() => {
    if (near) return;
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: PREVIEW_NEAR_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || eager) return;
    let cancelled = false;
    let release: (() => void) | null = null;
    void acquirePreviewSlot().then((done) => {
      if (cancelled) {
        done();
        return;
      }
      release = done;
      releaseRef.current = done;
      setSlotReady(true);
    });
    return () => {
      cancelled = true;
      release?.();
      if (releaseRef.current === release) releaseRef.current = null;
    };
  }, [eager, near]);

  function finishSlot() {
    releaseRef.current?.();
    releaseRef.current = null;
  }

  const showImage = near && (eager || slotReady) && !failed;

  return (
    <figure
      ref={frameRef}
      className={`relative overflow-hidden rounded-lg ${contain ? "bg-white" : "bg-[#111]"}`}
    >
      {failed ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt(0);
            setManualRetry((current) => current + 1);
          }}
          className={`${aspectClass} flex w-full flex-col items-center justify-center gap-1 bg-[#1c1c1e] px-2 text-center text-[11px] leading-tight text-[#8e8e93]`}
        >
          <span>Preview unavailable</span>
          <span className="text-white">Retry</span>
        </button>
      ) : showImage ? (
        <Link href={href} aria-label={`View ${filename}`} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={attempt + manualRetry}
            src={withThumbRetry(src, attempt + manualRetry)}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onLoad={finishSlot}
            onError={() => {
              if (attempt < THUMB_RETRY_LIMIT) {
                setAttempt(attempt + 1);
                return;
              }
              finishSlot();
              setFailed(true);
            }}
            className={`${aspectClass} w-full ${fitClass}`}
          />
        </Link>
      ) : (
        <Link href={href} aria-label={`View ${filename}`} className="block">
          <div className={`${aspectClass} w-full`} />
        </Link>
      )}
      <a
        href={downloadUrl}
        download={filename}
        aria-label={`Download ${filename}`}
        className="absolute right-1 top-1 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
      >
        Download
      </a>
    </figure>
  );
}
