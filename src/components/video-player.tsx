"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  availableQualities,
  playbackSourceType,
  resolvePlaybackQuality,
  shouldReportDisplaySize,
  videoFrameStyle,
  type QualityChoice,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeRef = useRef<{ time: number; paused: boolean } | null>(null);
  const reportedRef = useRef(false);
  const [choice, setChoice] = useState<QualityChoice>("auto");
  const [size, setSize] = useState(() =>
    width && height ? { width, height } : null,
  );
  const [failedRendition, setFailedRendition] = useState(false);

  const available = availableQualities(renditions);
  const resolved = failedRendition ? "original" : resolvePlaybackQuality(choice, available);
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

  function rememberPlayback() {
    const video = videoRef.current;
    if (!video) return;
    resumeRef.current = { time: video.currentTime, paused: video.paused };
  }

  function onQuality(next: QualityChoice) {
    if (next === choice) return;
    rememberPlayback();
    setFailedRendition(false);
    setChoice(next);
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
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
    const pending = resumeRef.current;
    if (!pending) return;
    resumeRef.current = null;
    if (pending.time > 0 && Number.isFinite(video.duration) && pending.time < video.duration) {
      video.currentTime = pending.time;
    }
    if (!pending.paused) void video.play().catch(() => undefined);
  }

  const autoPlays = resolvePlaybackQuality("auto", available);
  const autoLabel = autoPlays === "original" ? "Auto" : `Auto · ${autoPlays}p`;

  return (
    <figure className="flex w-full flex-col gap-2">
      <div className="mx-auto max-w-full overflow-hidden rounded-xl bg-black" style={videoFrameStyle(size?.width ?? null, size?.height ?? null)}>
        <video
          ref={videoRef}
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
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 text-sm text-[#c7c7cc]">
        <span className="min-w-0 truncate">{filename}</span>
        <span className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-[#8e8e93]">
            Quality
            <select
              aria-label="Playback quality"
              value={failedRendition ? "original" : choice}
              onChange={(event) => onQuality(event.target.value as QualityChoice)}
              className="min-h-11 rounded-md bg-[#1c1c1e] px-2 text-sm text-white"
            >
              <option value="auto">{autoLabel}</option>
              <option value="1080" disabled={!available.includes("1080")} title={available.includes("1080") ? undefined : "Not on the share yet"}>
                1080p
              </option>
              <option value="720" disabled={!available.includes("720")} title={available.includes("720") ? undefined : "Not on the share yet"}>
                720p
              </option>
              <option value="original">Original</option>
            </select>
          </label>
          <a href={url} download={filename} className="text-white">
            Download
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
