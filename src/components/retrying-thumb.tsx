"use client";

import { useEffect, useRef, useState } from "react";
import { acquirePreviewSlot, PREVIEW_NEAR_MARGIN } from "@/lib/preview-queue";
import { THUMB_RETRY_LIMIT, thumbRetryDelayWithJitter, withThumbRetry } from "@/lib/thumb-retry";

/**
 * Grid, list, and reel thumbnail. A neutral box until the bytes exist,
 * then the image. A 503 from the NAS generator is retried with backoff.
 * Only the first eager paint skips the shared slot; every retry waits for one.
 */
export function ThumbImage({
  src,
  alt,
  eager = false,
  loading,
  className = "h-full w-full object-cover",
  placeholderClassName = "h-full w-full bg-[#1c1c1e]",
  reel = false,
  draggable,
  onExhausted,
}: {
  src: string;
  alt: string;
  eager?: boolean;
  /** Defaults to eager or lazy from `eager`. The reel's neighbor is in the HTML and still lazy. */
  loading?: "eager" | "lazy";
  className?: string;
  placeholderClassName?: string;
  reel?: boolean;
  draggable?: boolean;
  onExhausted?: () => void;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [near, setNear] = useState(eager);
  const [slotReady, setSlotReady] = useState(eager);
  const firstPaint = eager && attempt === 0 && !waiting;
  const needsSlot = near && !waiting && !failed && !firstPaint;
  const showImage = near && !failed && !waiting && (firstPaint || slotReady);

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
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!needsSlot) return;
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
      setSlotReady(false);
    };
  }, [needsSlot, attempt]);

  function finishSlot() {
    releaseRef.current?.();
    releaseRef.current = null;
  }

  if (!showImage) {
    return <span ref={frameRef} className={placeholderClassName} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={attempt}
      src={withThumbRetry(src, attempt)}
      alt={alt}
      loading={loading ?? (eager ? "eager" : "lazy")}
      decoding="async"
      draggable={draggable}
      {...(reel ? { "data-reel-thumb": "" } : {})}
      className={className}
      onLoad={finishSlot}
      onError={() => {
        if (attempt < THUMB_RETRY_LIMIT) {
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          finishSlot();
          setWaiting(true);
          const delay = thumbRetryDelayWithJitter(attempt, Math.random());
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setWaiting(false);
            setAttempt((current) => current + 1);
          }, delay);
          return;
        }
        finishSlot();
        setFailed(true);
        onExhausted?.();
      }}
    />
  );
}
