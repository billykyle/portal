"use client";

import { PreviewImage } from "@/components/preview-image";

/** Small 1:1 preview. A dark square when this file has no thumb. */
export function ListRowPreview({
  src,
  contain = false,
  eager = false,
}: {
  src: string | null;
  contain?: boolean;
  eager?: boolean;
}) {
  return (
    <span className="inline-block size-12 shrink-0 overflow-hidden rounded-md bg-[#1c1c1e]" aria-hidden="true">
      {src ? (
        <PreviewImage
          src={src}
          alt=""
          eager={eager}
          quiet
          className={contain ? "size-full object-contain" : "size-full object-cover"}
        />
      ) : null}
    </span>
  );
}
