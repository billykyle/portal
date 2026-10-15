"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { downloadMode, playerMode, type MuxPlaybackView } from "@/lib/mux-policy";
import {
  availableQualities,
  playbackSourceType,
  resolvePlaybackQuality,
  shouldReportDisplaySize,
  videoFrameStyle,
  videoTileStyle,
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
  mux = null,
  caption = true,
  showDownload = true,
  tile = false,
}: {
  id: string;
  url: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  renditions?: PlayerRendition[];
  mux?: MuxPlaybackView | null;
  /** File name and download under the frame. List rows supply their own. */
  caption?: boolean;
  showDownload?: boolean;
  /** Fill a photo-grid cell. The stage player keeps the large frame. */
  tile?: boolean;
}) {
  const reportedRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => (width && height ? { width, height } : null));
  const [failedRendition, setFailedRendition] = useState(false);
  const [polled, setPolled] = useState<{ source: MuxPlaybackView | null | undefined; value: MuxPlaybackView } | null>(null);
  const view = polled && polled.source === mux ? polled.value : (mux ?? null);

  const mode = playerMode(view);
  const save = downloadMode(view);
  const available = availableQualities(renditions);
  const resolved = failedRendition ? "original" : resolvePlaybackQuality("auto", available);
  const playUrl =
    resolved === "original" ? url : (renditions.find((item) => item.quality === resolved)?.url ?? url);
  const stored = width && height ? { width, height } : null;

  useEffect(() => {
    if (mode !== "processing" && save !== "preparing") return;
    let cancel = false;
    const tick = () => {
      void fetch(`/api/media/${id}/mux`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: MuxPlaybackView | null) => {
          if (!cancel && data && typeof data === "object" && "status" in data) {
            setPolled({ source: mux, value: data });
          }
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(tick, 10_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [id, mode, mux, save]);

  useEffect(() => {
    const host = hostRef.current;
    if (mode !== "mux" || !host || !view?.playbackId || !view.token) return;
    let cancel = false;
    void import("@mux/mux-player").then(() => {
      if (cancel || !host.isConnected) return;
      const player = document.createElement("mux-player");
      player.setAttribute("playback-id", view.playbackId ?? "");
      player.setAttribute("playback-token", view.token ?? "");
      player.setAttribute("stream-type", "on-demand");
      player.setAttribute("accent-color", "#ffffff");
      player.style.display = "block";
      player.style.width = "100%";
      player.style.height = "100%";
      player.setAttribute("aria-label", filename);
      host.replaceChildren(player);
    });
    return () => {
      cancel = true;
    };
  }, [filename, mode, view?.playbackId, view?.token]);

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
        style={(tile ? videoTileStyle : videoFrameStyle)(size?.width ?? null, size?.height ?? null)}
      >
        {mode === "mux" && view?.playbackId ? (
          <div
            ref={hostRef}
            data-mux-player=""
            data-playback-id={view.playbackId}
            className="block h-full w-full bg-black"
          />
        ) : mode === "processing" ? (
          <div role="status" className="flex h-full min-h-24 items-center justify-center px-4 text-sm text-[#c7c7cc]">
            Processing
          </div>
        ) : (
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
        )}
      </div>
      {caption ? (
        <figcaption className="flex items-center justify-between gap-3 px-1 text-sm text-[#c7c7cc]">
          <span className="min-w-0 truncate">{filename}</span>
          {showDownload ? <VideoDownload url={url} filename={filename} mux={view} /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function VideoDownload({
  url,
  filename,
  mux,
  className = "shrink-0 text-white",
}: {
  url: string;
  filename: string;
  mux?: MuxPlaybackView | null;
  className?: string;
}) {
  const save = downloadMode(mux);
  if (save === "mux" && mux?.downloadUrl) {
    return (
      <a href={mux.downloadUrl} className={className}>
        Download
      </a>
    );
  }
  if (save === "preparing") {
    return <span className={`${className} text-[#8e8e93]`}>Preparing download</span>;
  }
  return (
    <a href={url} download={filename} className={className}>
      Download
    </a>
  );
}
