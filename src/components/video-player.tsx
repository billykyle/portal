"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { downloadHref } from "@/lib/download-all";
import { downloadMode, playerMode, type MuxPlaybackView } from "@/lib/mux-policy";
import {
  availableQualities,
  resolvePlaybackQuality,
  shouldReportDisplaySize,
  videoFrameStyle,
  videoTileStyle,
  type VideoDisplaySize,
  type VideoQuality,
} from "@/lib/video-playback";

export type PlayerRendition = { quality: VideoQuality; url: string };

export function VideoPlayer({
  id,
  url,
  filename,
  thumbUrl,
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
  thumbUrl?: string | null;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const reportRef = useRef<(next: VideoDisplaySize) => void>(() => undefined);
  const [size, setSize] = useState<VideoDisplaySize | null>(() => (width && height ? { width, height } : null));
  const [failedRendition, setFailedRendition] = useState(false);
  const [started, setStarted] = useState(false);
  const [polled, setPolled] = useState<{ source: MuxPlaybackView | null | undefined; value: MuxPlaybackView } | null>(null);
  const view = polled && polled.source === mux ? polled.value : (mux ?? null);

  const mode = playerMode(view);
  const save = downloadMode(view);
  const available = availableQualities(renditions);
  const resolved = failedRendition ? "original" : resolvePlaybackQuality("auto", available);
  const playUrl =
    resolved === "original" ? url : (renditions.find((item) => item.quality === resolved)?.url ?? url);
  const stored = width && height ? { width, height } : null;

  function rememberSize(next: VideoDisplaySize, persist: boolean) {
    setSize((current) => (persist ? next : (current ?? next)));
    if (!persist || reportedRef.current || !url.startsWith("/api/media/") || !shouldReportDisplaySize(stored, next)) return;
    reportedRef.current = true;
    void fetch(`/api/media/${id}/dimensions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => undefined);
  }

  useEffect(() => {
    reportRef.current = (next) => rememberSize(next, true);
  });

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
      if (view.thumbnailToken) player.setAttribute("thumbnail-token", view.thumbnailToken);
      if (view.storyboardToken) player.setAttribute("storyboard-token", view.storyboardToken);
      if (view.posterUrl) player.setAttribute("poster", view.posterUrl);
      player.setAttribute("stream-type", "on-demand");
      player.setAttribute("accent-color", "#ffffff");
      player.style.display = "block";
      player.style.width = "100%";
      player.style.height = "100%";
      player.setAttribute("aria-label", filename);
      const onMeta = () => {
        const video = player.shadowRoot?.querySelector("video");
        if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return;
        reportRef.current({ width: video.videoWidth, height: video.videoHeight });
      };
      player.addEventListener("loadedmetadata", onMeta);
      host.replaceChildren(player);
    });
    return () => {
      cancel = true;
    };
  }, [filename, mode, view?.playbackId, view?.posterUrl, view?.storyboardToken, view?.thumbnailToken, view?.token]);

  useEffect(() => {
    if (size || !view?.posterUrl || (mode !== "mux" && mode !== "processing" && mode !== "poster")) return;
    const img = new Image();
    let cancel = false;
    img.onload = () => {
      if (cancel || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      setSize((current) => current ?? { width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = view.posterUrl;
    return () => {
      cancel = true;
    };
  }, [mode, size, view?.posterUrl]);

  useEffect(() => {
    if (mode !== "deferred" || !started) return;
    const video = videoRef.current;
    if (!video || video.getAttribute("src") === playUrl) return;
    video.setAttribute("src", playUrl);
    video.load();
    void video.play().catch(() => undefined);
  }, [mode, playUrl, started]);

  function onPosterLoad(event: SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    setSize((current) => current ?? { width: img.naturalWidth, height: img.naturalHeight });
  }

  function onLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
    rememberSize({ width: video.videoWidth, height: video.videoHeight }, true);
  }

  function startPlayback() {
    setStarted(true);
    const video = videoRef.current;
    if (!video) return;
    if (!video.getAttribute("src")) video.setAttribute("src", playUrl);
    void video.play().catch(() => undefined);
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
          <div role="status" className="relative flex h-full min-h-24 items-center justify-center bg-black px-4 text-sm text-[#c7c7cc]">
            {view?.posterUrl ? (
              <img src={view.posterUrl} alt="" className="absolute inset-0 h-full w-full object-contain" onLoad={onPosterLoad} />
            ) : null}
            <span className="relative">Processing</span>
          </div>
        ) : mode === "poster" ? (
          <div className="relative h-full min-h-24 bg-black">
            {view?.posterUrl ? (
              <img src={view.posterUrl} alt="" className="block h-full w-full object-contain" onLoad={onPosterLoad} />
            ) : null}
          </div>
        ) : (
          <div className="relative h-full w-full">
            <video
              ref={videoRef}
              controls
              controlsList="nodownload"
              playsInline
              preload="none"
              poster={thumbUrl || undefined}
              aria-label={filename}
              className="block h-full w-full bg-black object-contain"
              onLoadedMetadata={onLoadedMetadata}
              onError={() => {
                if (resolved !== "original") setFailedRendition(true);
              }}
            />
            {started ? null : (
              <button
                type="button"
                aria-label={`Play ${filename}`}
                className="absolute inset-0 flex items-center justify-center text-white"
                onClick={startPlayback}
              >
                <Play className="size-8 rounded-full bg-black/60 p-2" aria-hidden />
              </button>
            )}
          </div>
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
    <a href={downloadHref(url)} download={filename} className={className}>
      Download
    </a>
  );
}
