"use client";

import { useMemo, useState } from "react";
import { BackupPanel } from "@/components/backup-panel";
import { DownloadAllButton, FileDownloadButton } from "@/components/download-controls";
import { PhotoViewer, type ViewerItem } from "@/components/photo-viewer";
import { mediaLabel } from "@/lib/media";

type Item = ViewerItem;

export function ShootDetail({
  address,
  dateLabel,
  dropboxUrl,
  folderName,
  media,
}: {
  address: string;
  dateLabel: string;
  dropboxUrl: string | null;
  folderName: string;
  media: Item[];
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const photos = media.filter((item) => item.type === "photo");
  const videos = media.filter((item) => item.type === "video");
  const plans = media.filter((item) => item.type === "floor_plan");
  const files = useMemo(
    () => media.map((item) => ({ url: item.url, filename: item.filename })),
    [media],
  );

  return (
    <div className="flex flex-col gap-8 pb-16">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
        <h1 className="text-xl font-medium leading-snug">{address}</h1>
      </header>

      <DownloadAllButton files={files} folderName={folderName} />

      {photos.length > 0 ? (
        <Section title={mediaLabel("photo")}>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((item) => (
              <figure key={item.id} className="relative overflow-hidden rounded-xl bg-[#111]">
                <button
                  type="button"
                  onClick={() => setViewerIndex(media.findIndex((entry) => entry.id === item.id))}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.filename} className="aspect-[4/3] w-full object-cover" />
                </button>
                <div className="absolute right-1 top-1">
                  <FileDownloadButton file={{ url: item.url, filename: item.filename }} />
                </div>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {videos.length > 0 ? (
        <Section title={mediaLabel("video")}>
          <div className="flex flex-col gap-4">
            {videos.map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-xl bg-[#111]">
                <video src={item.url} controls playsInline preload="metadata" className="w-full" />
                <figcaption className="flex items-center justify-between px-3 py-2 text-sm text-[#c7c7cc]">
                  <span className="truncate">{item.filename}</span>
                  <FileDownloadButton file={{ url: item.url, filename: item.filename }} />
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {plans.length > 0 ? (
        <Section title={mediaLabel("floor_plan")}>
          <div className="flex flex-col gap-3">
            {plans.map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-xl bg-white">
                <button
                  type="button"
                  onClick={() => setViewerIndex(media.findIndex((entry) => entry.id === item.id))}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.filename} className="w-full bg-white object-contain" />
                </button>
                <figcaption className="flex items-center justify-between bg-black px-3 py-2 text-sm text-[#c7c7cc]">
                  <span className="truncate">{item.filename}</span>
                  <FileDownloadButton file={{ url: item.url, filename: item.filename }} />
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {media.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No files on this shoot yet.</p>
      ) : null}

      <BackupPanel dropboxUrl={dropboxUrl} />

      {viewerIndex != null ? (
        <PhotoViewer
          items={media}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{title}</h2>
      {children}
    </section>
  );
}
