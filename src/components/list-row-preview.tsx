"use client";

import { PreviewImage } from "@/components/preview-image";
import { listRowFrame } from "@/lib/list-preview";

/** Small row preview. A dark square when this file has no thumb or no pixel size. */
export function ListRowPreview({
  src,
  contain = false,
  eager = false,
  width,
  height,
}: {
  src: string | null;
  contain?: boolean;
  eager?: boolean;
  width?: number | null;
  height?: number | null;
}) {
  const frame = listRowFrame(width, height);
  return (
    <span className={frame.className} style={frame.style} aria-hidden="true">
      {src ? (
        <PreviewImage
          src={src}
          alt=""
          eager={eager}
          quiet
          className={contain || frame.style ? "size-full object-contain" : "size-full object-cover"}
        />
      ) : null}
    </span>
  );
}
