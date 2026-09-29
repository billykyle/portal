"use client";

import { ListRowPreview } from "@/components/list-row-preview";
import { useSectionLayout } from "@/components/section-layout";
import { listPreviewSrc } from "@/lib/list-preview";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";

/** Filename and download. List mode adds the small square; the default row does not. */
export function FileDownloadList({
  items,
}: {
  items: { id: string; url: string; filename: string; thumbUrl?: string | null }[];
}) {
  const listed = useSectionLayout() === "list";
  return (
    <ul>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={
            listed
              ? "flex items-center gap-3 border-b border-white/10 py-2 text-sm text-[#c7c7cc]"
              : "flex items-center justify-between gap-3 border-b border-white/10 py-3 text-sm text-[#c7c7cc]"
          }
        >
          {listed ? <ListRowPreview src={listPreviewSrc(item)} eager={index < PREVIEW_EAGER_COUNT} /> : null}
          <span className={listed ? "min-w-0 flex-1 truncate" : "min-w-0 truncate"}>{item.filename}</span>
          <a href={item.url} download={item.filename} className="shrink-0 text-white">
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
