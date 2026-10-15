"use client";

import Link from "next/link";
import { useState } from "react";
import { ThumbImage } from "@/components/retrying-thumb";
import { SelectionMark, useShootSelection } from "@/components/shoot-selection";

export function MediaTile({
  id,
  href,
  src,
  filename,
  downloadUrl,
  contain,
  ratio = "square",
  eager = true,
}: {
  id?: string;
  href: string;
  src: string;
  filename: string;
  downloadUrl: string;
  contain: boolean;
  ratio?: "square" | "3/2";
  /** In the first HTML so the opening rows start before hydration. */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [manualRetry, setManualRetry] = useState(0);
  const aspectClass = ratio === "3/2" ? "aspect-[3/2]" : "aspect-square";
  const fitClass = contain ? "object-contain p-1" : "object-cover";
  const selection = useShootSelection();
  const selecting = Boolean(selection?.selecting && id);
  const selected = Boolean(id && selection?.selected.has(id));
  const image = failed ? null : (
    <ThumbImage
      key={manualRetry}
      src={src}
      alt=""
      eager={eager}
      className={`${aspectClass} w-full ${fitClass}`}
      placeholderClassName={`${aspectClass} block w-full`}
      onExhausted={() => setFailed(true)}
    />
  );

  return (
    <figure className={`relative overflow-hidden rounded-lg ${contain ? "bg-white" : "bg-[#111]"}`}>
      {selecting ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${filename}`}
          onClick={() => id && selection?.toggle(id)}
          className="relative block w-full"
        >
          {failed ? (
            <span
              className={`${aspectClass} flex w-full items-center justify-center bg-[#1c1c1e] px-2 text-center text-[11px] text-[#8e8e93]`}
            >
              Preview unavailable
            </span>
          ) : (
            image
          )}
          <SelectionMark selected={selected} className="absolute left-1.5 top-1.5 z-10" />
        </button>
      ) : failed ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setManualRetry((current) => current + 1);
          }}
          className={`${aspectClass} flex w-full flex-col items-center justify-center gap-1 bg-[#1c1c1e] px-2 text-center text-[11px] leading-tight text-[#8e8e93]`}
        >
          <span>Preview unavailable</span>
          <span className="text-white">Retry</span>
        </button>
      ) : (
        <Link href={href} aria-label={`View ${filename}`} className="block">
          {image}
        </Link>
      )}
      {selecting ? null : (
        <a
          href={downloadUrl}
          download={filename}
          aria-label={`Download ${filename}`}
          className="absolute right-1 top-1 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
        >
          Download
        </a>
      )}
    </figure>
  );
}
