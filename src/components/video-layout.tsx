"use client";

import { ListRowPreview } from "@/components/list-row-preview";
import { useSectionLayout } from "@/components/section-layout";
import { SelectionMark, useShootSelection } from "@/components/shoot-selection";
import { VideoPlayer, type PlayerRendition } from "@/components/video-player";
import { listPreviewSrc } from "@/lib/list-preview";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";

export type VideoLayoutItem = {
  id: string;
  url: string;
  filename: string;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  renditions?: PlayerRendition[];
};

const PAIR_GRID = "flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start";
const CLIPS_GRID = "grid grid-cols-3 items-start gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5";

function VideoList({ items }: { items: VideoLayoutItem[] }) {
  const selection = useShootSelection();
  const selecting = Boolean(selection?.selecting);
  return (
    <ul>
      {items.map((item, index) => {
        const selected = selection?.selected.has(item.id) ?? false;
        if (selecting) {
          return (
            <li key={item.id} className="border-b border-white/10 py-2">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => selection?.toggle(item.id)}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <SelectionMark selected={selected} />
                <ListRowPreview src={listPreviewSrc(item)} eager={index < PREVIEW_EAGER_COUNT} />
                <span className="min-w-0 flex-1 truncate text-[#c7c7cc]">{item.filename}</span>
              </button>
            </li>
          );
        }
        return (
          <li key={item.id} className="border-b border-white/10 py-2">
            <div className="flex items-start gap-3 text-sm">
              <ListRowPreview src={listPreviewSrc(item)} eager={index < PREVIEW_EAGER_COUNT} />
              <details className="min-w-0 flex-1">
                <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 truncate text-[#c7c7cc]">{item.filename}</span>
                  <span className="shrink-0 text-white">Play</span>
                </summary>
                <div className="pt-3">
                  <VideoPlayer
                    id={item.id}
                    url={item.url}
                    filename={item.filename}
                    width={item.width}
                    height={item.height}
                    renditions={item.renditions}
                    caption={false}
                  />
                </div>
              </details>
              <a href={item.url} download={item.filename} className="flex h-12 shrink-0 items-center text-white">
                Download
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Current player layout, or a file row with playback and download. */
export function VideoLayout({
  items,
  columns,
}: {
  items: VideoLayoutItem[];
  columns: "pair" | "clips" | "single";
}) {
  const layout = useSectionLayout();
  const selection = useShootSelection();
  const selecting = Boolean(selection?.selecting);
  if (layout === "list") return <VideoList items={items} />;
  if (columns === "single") {
    const item = items[0];
    if (!item) return null;
    const selected = selection?.selected.has(item.id) ?? false;
    return (
      <div className="relative">
        <VideoPlayer
          id={item.id}
          url={item.url}
          filename={item.filename}
          width={item.width}
          height={item.height}
          renditions={item.renditions}
          showDownload={!selecting}
        />
        {selecting ? (
          <button
            type="button"
            aria-pressed={selected}
            aria-label={`${selected ? "Deselect" : "Select"} ${item.filename}`}
            onClick={() => selection?.toggle(item.id)}
            className="absolute inset-0 z-10 rounded-xl"
          >
            <SelectionMark selected={selected} className="absolute left-2 top-2" />
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={columns === "clips" ? CLIPS_GRID : PAIR_GRID}>
      {items.map((item) => {
        const selected = selection?.selected.has(item.id) ?? false;
        return (
          <div key={item.id} className="relative">
            <VideoPlayer
              id={item.id}
              url={item.url}
              filename={item.filename}
              width={item.width}
              height={item.height}
              renditions={item.renditions}
              showDownload={!selecting}
            />
            {selecting ? (
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? "Deselect" : "Select"} ${item.filename}`}
                onClick={() => selection?.toggle(item.id)}
                className="absolute inset-0 z-10 rounded-xl"
              >
                <SelectionMark selected={selected} className="absolute left-2 top-2" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
