"use client";

import { useState } from "react";
import { ThumbImage } from "@/components/retrying-thumb";

/** Card and poster image. A neutral box until the thumbnail is ready, then the image. */
export function PreviewImage({
  src,
  alt,
  eager = false,
  quiet = false,
  className = "h-full w-full object-cover",
}: {
  src: string;
  alt: string;
  eager?: boolean;
  /** Leave the parent square blank instead of a retry message. */
  quiet?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (quiet) return null;
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1c1c1e] px-2 text-center text-[11px] text-[#8e8e93]">
        Preview unavailable
      </div>
    );
  }

  return (
    <ThumbImage
      src={src}
      alt={alt}
      eager={eager}
      className={className}
      placeholderClassName="block h-full w-full bg-[#1c1c1e]"
      onExhausted={() => setFailed(true)}
    />
  );
}
