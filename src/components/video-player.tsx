"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  availableQualities,
  playbackSourceType,
  resolvePlaybackQuality,
  shouldReportDisplaySize,
  videoFrameStyle,
  type VideoQuality,
} from "@/lib/video-playback";

export type PlayerRendition = { quality: VideoQuality; url: string };

export function VideoPlayer({
  id,
  url,
  filename,
  width,
  height,
  renditions = [],
}: {
  id: string;
  url: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  renditions?: PlayerRendition[];
}) {
  const reportedRef = useRef(false);
  const [size, setSize] = useState(() => (width && height ? { width, height } : null));
  const [failedRendition, setFailedRendition] = useState(false);

  const available = availableQualities(renditions);
  const resolved = failedRendition ? "original" : resolvePlaybackQuality("auto", available);
  const playUrl =
    resolved === "original" ? url : (renditions.find((item) => item.quality === resolved)?.url ?? url);
  const stored = width && height ? { width, height } : null;

  useEffect(() => {
    if (size || !url.startsWith("/api/media/")) return;
    let cancel = false;
    void fetch(`/api/media/${id}/dimensions`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { width?: number; height?: number } | null) => {
        if (cancel || !data?.width || !data.height) return;
        setSize((current) => current ?? { width: data.width as number, height: data.height as number });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [id, size, url]);

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
    const next = { width: video.videoWidth, height: video.videoHeight };
    setSize(next);
    if (!reportedRef.current && url.startsWith("/api/media/") && shouldReportDisplaySize(stored, next)) {
      reportedRef.current = true;
      void fetch(`/api/media/${id}/dimensions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => undefined);
    }
  }

  return (
    <figure className="flex w-full flex-col gap-2">
      <div
        className="mx-auto max-w-full overflow-hidden rounded-xl bg-black"
        style={videoFrameStyle(size?.width ?? null, size?.height ?? null)}
      >
        <video
          key={playUrl}
          controls
          controlsList="nodownload"
          playsInline
          preload="metadata"
          aria-label={filename}
          className="block h-full w-full bg-black object-contain"
          onLoadedMetadata={onLoadedMetadata}
          onError={() => {
            if (resolved !== "original") setFailedRendition(true);
          }}
        >
          <source src={playUrl} type={playbackSourceType(resolved === "original" ? filename : `${filename}.mp4`)} />
        </video>
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-1 text-sm text-[#c7c7cc]">
        <span className="min-w-0 truncate">{filename}</span>
        <a href={url} download={filename} className="shrink-0 text-white">
          Download
        </a>
      </figcaption>
    </figure>
  );
}
