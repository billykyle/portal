import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  downloadMode,
  isZipExcludedVideo,
  muxDisplaySize,
  muxDownloadStem,
  MUX_INGEST_OVERNIGHT_REASON,
  MUX_SOURCE_RETRY_AFTER_SECONDS,
  muxIngestAllowedAt,
  muxIngestClosedRetryAfterSeconds,
  muxIngestDecision,
  muxPosterUrl,
  muxSourceDecision,
  muxSubmitBudget,
  muxStaticDownloadUrl,
  nasDownloadLooksPublic,
  nasOriginalAllowed,
  playerMode,
  publicMuxStatus,
  videoOmissionNote,
  type MuxPlaybackView,
} from "./mux-policy";

const ready: MuxPlaybackView = {
  status: "ready",
  playbackId: "play",
  token: "tok",
  downloadUrl: "https://stream.mux.com/play/highest.mp4?token=dl",
  staticStatus: "ready",
};

test("ingest skips non-video, unchanged ready files, and refreshes unfinished assets", () => {
  const current = {
    type: "video",
    assetId: "asset",
    status: "ready",
    staticStatus: "ready",
    sourcePath: "/share/a.mov",
    sourceBytes: 10,
  };
  assert.equal(muxIngestDecision({ ...current, type: "raw_video" }, { path: "/share/a.mov", bytes: 10 }), "skip");
  assert.equal(muxIngestDecision(current, { path: "/share/a.mov", bytes: 10 }), "skip");
  assert.equal(muxIngestDecision(current, { path: "/share/a.mov", bytes: 11 }), "submit");
  assert.equal(muxIngestDecision(current, { path: "/share/b.mov", bytes: 10 }), "submit");
  assert.equal(muxIngestDecision({ ...current, status: "errored" }, { path: "/share/a.mov", bytes: 10 }), "submit");
  assert.equal(muxIngestDecision({ ...current, assetId: null }, { path: "/share/a.mov", bytes: 10 }), "submit");
  assert.equal(muxIngestDecision({ ...current, status: "preparing" }, { path: "/share/a.mov", bytes: 10 }), "refresh");
  assert.equal(
    muxIngestDecision({ ...current, staticStatus: "preparing" }, { path: "/share/a.mov", bytes: 10 }),
    "refresh",
  );
  assert.equal(muxIngestDecision(current, { path: "/share/a.mov", bytes: null }), "skip");
  assert.equal(muxIngestDecision(current, { path: "/share/a.mov", bytes: 10 }, true), "submit");
});

test("Mux NAS pulls stay behind a sync and only run overnight", () => {
  const open = { ingestAllowed: true, closedRetryAfter: 0 };
  assert.equal(muxSubmitBudget({ preparing: 0, alreadySubmitted: 0 }), 1);
  assert.equal(muxSubmitBudget({ preparing: 2, alreadySubmitted: 0 }), 0);
  assert.equal(muxSubmitBudget({ preparing: 0, alreadySubmitted: 1 }), 0);
  assert.deepEqual(
    muxSourceDecision({ ...open, syncActive: true, activePulls: 0, thisMediaAlreadyPulling: false }),
    { allow: false, retryAfter: MUX_SOURCE_RETRY_AFTER_SECONDS },
  );
  assert.deepEqual(
    muxSourceDecision({ ...open, syncActive: false, activePulls: 1, thisMediaAlreadyPulling: false }),
    { allow: false, retryAfter: 30 },
  );
  assert.deepEqual(
    muxSourceDecision({ ...open, syncActive: false, activePulls: 1, thisMediaAlreadyPulling: true }),
    { allow: true },
  );
  assert.deepEqual(
    muxSourceDecision({ ...open, syncActive: true, activePulls: 1, thisMediaAlreadyPulling: true }),
    { allow: false, retryAfter: MUX_SOURCE_RETRY_AFTER_SECONDS },
  );
  assert.deepEqual(
    muxSourceDecision({
      syncActive: false,
      ingestAllowed: false,
      closedRetryAfter: 3600,
      activePulls: 0,
      thisMediaAlreadyPulling: true,
    }),
    { allow: false, retryAfter: 3600 },
  );
  assert.equal(muxIngestAllowedAt(new Date("2026-10-16T02:59:00Z")), false);
  assert.equal(muxIngestAllowedAt(new Date("2026-10-16T03:00:00Z")), true);
  assert.equal(muxIngestAllowedAt(new Date("2026-10-15T09:59:00Z")), true);
  assert.equal(muxIngestAllowedAt(new Date("2026-10-15T10:00:00Z")), false);
  assert.equal(muxIngestAllowedAt(new Date("2026-10-15T19:42:00Z")), false);
  assert.equal(muxIngestAllowedAt(new Date("2026-01-16T04:00:00Z")), true);
  assert.equal(muxIngestAllowedAt(new Date("2026-01-15T10:59:00Z")), true);
  assert.equal(muxIngestAllowedAt(new Date("2026-01-15T11:00:00Z")), false);
  assert.equal(muxIngestClosedRetryAfterSeconds(new Date("2026-10-15T10:00:00Z")), 17 * 3600);
  assert.equal(muxIngestClosedRetryAfterSeconds(new Date("2026-10-16T03:00:00Z")), 0);
  assert.match(MUX_INGEST_OVERNIGHT_REASON, /11pm to 6am Eastern/);
  const source = readFileSync(new URL("../app/api/mux/source/[id]/route.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("./nas-import.ts", import.meta.url), "utf8");
  const backfill = readFileSync(new URL("./mux-backfill.ts", import.meta.url), "utf8");
  assert.match(source, /grantMuxNasPull/);
  assert.doesNotMatch(source, /nasDirectFetchWorks/);
  assert.match(source, /retry-after/);
  assert.doesNotMatch(sync, /submitMuxForImported/);
  assert.match(sync, /Left \$\{count\} finished/);
  assert.match(backfill, /nasSyncIsActive/);
  assert.match(backfill, /muxIngestAllowedAt/);
  assert.match(backfill, /status: "deferred"/);
  const ingest = readFileSync(new URL("./mux-ingest.ts", import.meta.url), "utf8");
  assert.match(ingest, /muxIngestPause/);
});

test("player and download modes fall back when Mux is missing or still working", () => {
  assert.equal(playerMode(null), "deferred");
  assert.equal(playerMode({ ...ready, status: "preparing", token: null, downloadUrl: null }), "processing");
  assert.equal(playerMode({ ...ready, status: "preparing" }), "processing");
  assert.equal(playerMode(ready), "mux");
  assert.equal(playerMode({ ...ready, status: "errored" }), "mux");
  assert.equal(playerMode({ ...ready, status: "errored", token: null, downloadUrl: null }), "poster");
  assert.equal(downloadMode(null), "native");
  assert.equal(downloadMode(ready), "mux");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "preparing" }), "preparing");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "errored" }), "native");
  assert.equal(isZipExcludedVideo("video"), true);
  assert.equal(isZipExcludedVideo("raw_video"), true);
  assert.equal(isZipExcludedVideo("photo"), false);
});

test("a Mux video is not streamed from the NAS, and its poster and size come from Mux", () => {
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "ready", download: false }), false);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "errored", muxAssetId: null, download: false }), false);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "preparing", download: false }), false);
  assert.equal(nasOriginalAllowed({ type: "video", muxAssetId: "asset", muxStatus: null, download: false }), false);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "errored", download: true }), true);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: null, muxAssetId: null, download: false }), true);
  assert.equal(nasOriginalAllowed({ type: "raw_video", download: false }), true);
  const poster = new URL(muxPosterUrl("play", "thumb-token"));
  assert.equal(poster.origin, "https://image.mux.com");
  assert.equal(poster.pathname, "/play/thumbnail.jpg");
  assert.equal(poster.searchParams.get("token"), "thumb-token");
  assert.deepEqual(muxDisplaySize({ tracks: [{ type: "video", max_width: 1920, max_height: 1080 }] }), {
    width: 1920,
    height: 1080,
  });
  assert.equal(muxDisplaySize({ tracks: [{ type: "video" }] }), null);
  assert.equal(muxDisplaySize({}), null);
  const player = readFileSync(new URL("../components/video-player.tsx", import.meta.url), "utf8");
  const dimensions = readFileSync(new URL("../app/api/media/[id]/dimensions/route.ts", import.meta.url), "utf8");
  const mediaRoute = readFileSync(new URL("../app/api/media/[id]/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(player, /preload="metadata"/);
  assert.match(player, /preload="none"/);
  assert.match(player, /thumbnail-token/);
  assert.doesNotMatch(player, /dimensions`, \{ cache: "no-store" \}/);
  assert.doesNotMatch(dimensions, /ensureVideoDisplaySize/);
  assert.match(mediaRoute, /nasOriginalAllowed/);
});

test("download names and the zip note stay short and do not claim the original", () => {
  assert.equal(muxDownloadStem("Video/107 Louis Drive.mov"), "107 Louis Drive");
  assert.equal(muxDownloadStem("../weird?.mov"), "weird_");
  const url = new URL(muxStaticDownloadUrl("play", "tok", "tour.mov"));
  assert.equal(url.pathname, "/play/highest.mp4");
  assert.equal(url.searchParams.get("token"), "tok");
  assert.equal(url.searchParams.get("download"), "tour");
  assert.match(videoOmissionNote(["a.mov"]), /up to 1080p/);
  assert.match(videoOmissionNote(["a.mov"]), /a\.mov/);
  assert.equal(nasDownloadLooksPublic(206, "video/mp4"), true);
  assert.equal(nasDownloadLooksPublic(200, "application/json"), false);
  assert.equal(publicMuxStatus({ type: "photo", muxAssetId: null, muxPlaybackId: null, muxStatus: null, muxStaticStatus: null, muxError: null }), null);
});
