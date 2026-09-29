"use client";

import { useSectionLayout } from "@/components/section-layout";
import { VideoPlayer, type PlayerRendition } from "@/components/video-player";

export type VideoLayoutItem = {
  id: string;
  url: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  renditions?: PlayerRendition[];
};

const PAIR_GRID = "flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start";
const CLIPS_GRID = "grid grid-cols-3 items-start gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5";

function VideoList({ items }: { items: VideoLayoutItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-white/10 py-3">
          <div className="flex items-start justify-between gap-3 text-sm">
            <details className="min-w-0 flex-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
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
            <a href={item.url} download={item.filename} className="shrink-0 text-white">
              Download
            </a>
          </div>
        </li>
      ))}
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
  if (layout === "list") return <VideoList items={items} />;
  if (columns === "single") {
    const item = items[0];
    if (!item) return null;
    return (
      <VideoPlayer
        id={item.id}
        url={item.url}
        filename={item.filename}
        width={item.width}
        height={item.height}
        renditions={item.renditions}
      />
    );
  }
  return (
    <div className={columns === "clips" ? CLIPS_GRID : PAIR_GRID}>
      {items.map((item) => (
        <VideoPlayer
          key={item.id}
          id={item.id}
          url={item.url}
          filename={item.filename}
          width={item.width}
          height={item.height}
          renditions={item.renditions}
        />
      ))}
    </div>
  );
}
