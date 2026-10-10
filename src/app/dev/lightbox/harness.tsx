"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/photo-viewer";
import type { ViewerPhoto } from "@/lib/photo-viewer";

const photos: ViewerPhoto[] = Array.from({ length: 40 }, (_, index) => {
  const id = String(index + 1).padStart(2, "0");
  return {
    id,
    filename: `Full-${id}.jpg`,
    url: `/dev/photos/${id}`,
    thumbUrl: `/dev/photos/${id}?thumb=1`,
    width: 1600,
    height: 1000,
  };
});

export function LightboxHarness({ initialId, startOpen }: { initialId: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="min-h-[2400px] bg-black text-white">
      <header className="flex h-16 items-center justify-between px-4">
        <span>Menu</span>
        <span>BK</span>
        <span>Account</span>
      </header>
      <p className="px-4 text-sm text-[#8e8e93]">Oct 8, 2026</p>
      <h1 className="px-4 text-xl">520 N Rose Lane</h1>
      <div
        data-page-marker=""
        className="fixed right-0 left-0 z-[1] flex h-8 items-center justify-center bg-[rgb(255,0,0)] text-sm font-semibold text-white"
        style={{ top: 120 }}
      >
        Grid | List
      </div>
      <div data-scroll-marker="" className="mt-[900px] h-10 bg-white text-black">
        Scroll marker
      </div>
      <div className="h-[1400px]" />
      {open ? (
        <PhotoViewer photos={photos} initialId={initialId} basePath="/dev/lightbox" />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 left-6 z-30 rounded-full bg-white px-4 py-3 text-sm font-medium text-black"
        >
          Open photo
        </button>
      )}
    </div>
  );
}
