"use client";

import Link from "next/link";
import { useState } from "react";
import { THUMB_RETRY_LIMIT, withThumbRetry } from "@/lib/thumb-retry";

export function MediaTile({
  href,
  src,
  filename,
  downloadUrl,
  contain,
  ratio = "square",
}: {
  href: string;
  src: string;
  filename: string;
  downloadUrl: string;
  contain: boolean;
  ratio?: "square" | "3/2";
}) {
  const [attempt, setAttempt] = useState(0);
  const aspectClass = ratio === "3/2" ? "aspect-[3/2]" : "aspect-square";

  return (
    <figure className={`relative overflow-hidden rounded-lg ${contain ? "bg-white" : "bg-[#111]"}`}>
      <Link href={href} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={withThumbRetry(src, attempt)}
          alt={filename}
          loading="lazy"
          decoding="async"
          onError={() => {
            setAttempt((current) => (current < THUMB_RETRY_LIMIT ? current + 1 : current));
          }}
          className={`${aspectClass} w-full ${contain ? "object-contain p-1" : "object-cover"}`}
        />
      </Link>
      <a
        href={downloadUrl}
        download={filename}
        className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
      >
        Download
      </a>
    </figure>
  );
}
