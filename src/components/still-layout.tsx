"use client";

import { ListRowPreview } from "@/components/list-row-preview";
import { MediaTile } from "@/components/media-tile";
import { useSectionLayout } from "@/components/section-layout";
import { listPreviewSrc } from "@/lib/list-preview";
import { photoViewerHref } from "@/lib/photo-viewer";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";

const PHOTO_GRID = "grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 2xl:grid-cols-6";
const PLAN_GRID = "grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5";

export type StillItem = {
  id: string;
  url: string;
  thumbUrl?: string;
  filename: string;
};

/** Thumbnail grid, or a filename and download row. Photos, floor plans, and thumbnails. */
export function StillLayout({
  items,
  basePath,
  contain,
  ratio = "3/2",
}: {
  items: StillItem[];
  basePath: string;
  contain: boolean;
  ratio?: "square" | "3/2";
}) {
  const layout = useSectionLayout();
  if (layout === "list") {
    return (
      <ul>
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-3 border-b border-white/10 py-2 text-sm"
          >
            <ListRowPreview src={listPreviewSrc(item)} contain={contain} eager={index < PREVIEW_EAGER_COUNT} />
            <a href={photoViewerHref(basePath, item.id)} className="min-w-0 flex-1 truncate text-[#c7c7cc]">
              {item.filename}
            </a>
            <a href={item.url} download={item.filename} className="shrink-0 text-white">
              Download
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={ratio === "square" ? PLAN_GRID : PHOTO_GRID}>
      {items.map((item, index) => (
        <MediaTile
          key={item.id}
          href={photoViewerHref(basePath, item.id)}
          src={item.thumbUrl ?? item.url}
          filename={item.filename}
          downloadUrl={item.url}
          contain={contain}
          ratio={ratio}
          eager={index < PREVIEW_EAGER_COUNT}
        />
      ))}
    </div>
  );
}
