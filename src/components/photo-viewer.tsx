"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

export type ViewerItem = {
  id: string;
  url: string;
  filename: string;
  type: "photo" | "video" | "floor_plan";
};

export function PhotoViewer({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: ViewerItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const item = items[index];
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndexChange(Math.min(items.length - 1, index + 1));
      if (event.key === "ArrowLeft") onIndexChange(Math.max(0, index - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        if (touchX == null) return;
        const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
        if (dx > 40) onIndexChange(Math.max(0, index - 1));
        if (dx < -40) onIndexChange(Math.min(items.length - 1, index + 1));
        setTouchX(null);
      }}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <button type="button" onClick={onClose} className="p-2 text-white" aria-label="Close">
          <X className="size-6" />
        </button>
        <p className="truncate px-2 text-sm text-[#a1a1a1]">
          {item.filename} · {index + 1} / {items.length}
        </p>
        <span className="w-10" />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6">
        {item.type === "video" ? (
          <video src={item.url} controls playsInline className="max-h-full max-w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.filename} className="max-h-full max-w-full object-contain" />
        )}
        {index > 0 ? (
          <button
            type="button"
            aria-label="Previous"
            onClick={() => onIndexChange(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        {index < items.length - 1 ? (
          <button
            type="button"
            aria-label="Next"
            onClick={() => onIndexChange(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
          >
            <ChevronRight className="size-6" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
