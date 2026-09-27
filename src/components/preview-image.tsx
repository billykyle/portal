"use client";

import { useEffect, useRef, useState } from "react";
import { THUMB_RETRY_LIMIT, thumbRetryDelayMs, withThumbRetry } from "@/lib/thumb-retry";

/** Card and poster image. Lazy until it is near, then retries while the NAS wakes. */
export function PreviewImage({
  src,
  alt,
  eager = false,
  className = "h-full w-full object-cover",
}: {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const timerRef = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1c1c1e] px-2 text-center text-[11px] text-[#8e8e93]">
        Preview unavailable
      </div>
    );
  }

  if (waiting) {
    return <div className="h-full w-full bg-[#1c1c1e]" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withThumbRetry(src, attempt)}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={className}
      onError={() => {
        if (attempt < THUMB_RETRY_LIMIT) {
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          setWaiting(true);
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setWaiting(false);
            setAttempt((current) => current + 1);
          }, thumbRetryDelayMs(attempt));
          return;
        }
        setFailed(true);
      }}
    />
  );
}
