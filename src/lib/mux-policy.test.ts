import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  downloadMode,
  isZipExcludedVideo,
  muxDisplaySize,
  muxDownloadStem,
  muxEventContinuesQueue,
  MUX_SOURCE_REDIRECT_TIMEOUT_MS,
  MUX_SOURCE_RETRY_AFTER_SECONDS,
  muxIngestDecision,
  muxInstantMs,
  muxPosterUrl,
  muxPreparingDisposition,
  muxSourceDecision,
  muxSubmitBudget,
  MUX_PREPARING_TIMEOUT_MS,
  redactMuxError,
  muxStaticDownloadUrl,
  nasDownloadLooksPublic,
  nasFallbackUrl,
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
    resolutionTier: "2160p",
    pendingStatus: null,
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
  assert.equal(muxIngestDecision(current, { path: "/share/a.mov", bytes: 10 }, true), "upgrade");
  assert.equal(muxIngestDecision({ ...current, assetId: null }, { path: "/share/a.mov", bytes: 10 }, true), "submit");
  assert.equal(muxIngestDecision({ ...current, resolutionTier: null }, { path: "/share/a.mov", bytes: 10 }), "upgrade");
  assert.equal(muxIngestDecision({ ...current, resolutionTier: "1080p" }, { path: "/share/a.mov", bytes: 10 }), "upgrade");
  assert.equal(
    muxIngestDecision({ ...current, resolutionTier: null, pendingStatus: "preparing" }, { path: "/share/a.mov", bytes: 10 }),
    "refresh",
  );
  assert.equal(
    muxIngestDecision({ ...current, resolutionTier: null, pendingStatus: "errored" }, { path: "/share/a.mov", bytes: 10 }),
    "upgrade",
  );
});

test("Mux NAS pulls stay behind a sync and copy one file at a time", () => {
  assert.equal(muxSubmitBudget({ preparing: 0, alreadySubmitted: 0 }), 1);
  assert.equal(muxSubmitBudget({ preparing: 2, alreadySubmitted: 0 }), 0);
  assert.equal(muxSubmitBudget({ preparing: 0, alreadySubmitted: 1 }), 0);
  const now = Date.parse("2026-10-16T01:00:00.000Z");
  assert.equal(muxInstantMs("1760000000"), 1760000000 * 1000);
  assert.equal(
    muxPreparingDisposition({ status: "preparing", startedAt: now - MUX_PREPARING_TIMEOUT_MS + 1, nowMs: now }),
    "wait",
  );
  assert.equal(
    muxPreparingDisposition({ status: "preparing", startedAt: now - MUX_PREPARING_TIMEOUT_MS, nowMs: now }),
    "timeout",
  );
  assert.equal(
    muxPreparingDisposition({
      status: "preparing",
      startedAt: String(Math.floor((now - 3 * 60 * 60 * 1000) / 1000)),
      nowMs: now,
    }),
    "timeout",
  );
  assert.equal(muxPreparingDisposition({ status: "preparing", startedAt: null, nowMs: now }), "wait");
  assert.equal(muxPreparingDisposition({ status: "errored", startedAt: now - MUX_PREPARING_TIMEOUT_MS, nowMs: now }), "errored");
  assert.equal(muxPreparingDisposition({ status: "ready", startedAt: now, nowMs: now }), "ready");
  assert.equal(
    redactMuxError('The input file "https://portal.example/api/mux/source/x?exp=1&sig=abc" could not be downloaded.'),
    "The input file \"the source URL\" could not be downloaded.",
  );
  assert.deepEqual(
    muxSourceDecision({ syncActive: true, activePulls: 0, thisMediaAlreadyPulling: false }),
    { allow: false, retryAfter: MUX_SOURCE_RETRY_AFTER_SECONDS },
  );
  assert.deepEqual(
    muxSourceDecision({ syncActive: false, activePulls: 1, thisMediaAlreadyPulling: false }),
    { allow: false, retryAfter: 30 },
  );
  assert.deepEqual(
    muxSourceDecision({ syncActive: false, activePulls: 1, thisMediaAlreadyPulling: true }),
    { allow: true },
  );
  assert.deepEqual(
    muxSourceDecision({ syncActive: true, activePulls: 1, thisMediaAlreadyPulling: true }),
    { allow: false, retryAfter: MUX_SOURCE_RETRY_AFTER_SECONDS },
  );
  assert.deepEqual(
    muxSourceDecision({ syncActive: false, activePulls: 0, thisMediaAlreadyPulling: false }),
    { allow: true },
  );
  const source = readFileSync(new URL("../app/api/mux/source/[id]/route.ts", import.meta.url), "utf8");
  const sync = readFileSync(new URL("./nas-import.ts", import.meta.url), "utf8");
  const backfill = readFileSync(new URL("./mux-backfill.ts", import.meta.url), "utf8");
  const policy = readFileSync(new URL("./mux-policy.ts", import.meta.url), "utf8");
  const nas = readFileSync(new URL("./nas.ts", import.meta.url), "utf8");
  const webhook = readFileSync(new URL("../app/api/mux/webhook/route.ts", import.meta.url), "utf8");
  const events = readFileSync(new URL("./mux-events.ts", import.meta.url), "utf8");
  assert.match(source, /grantMuxNasPull/);
  assert.match(source, /releaseMuxNasPull/);
  assert.match(source, /MUX_SOURCE_REDIRECT_TIMEOUT_MS/);
  assert.match(source, /maxDuration = 30/);
  assert.match(source, /new Response\(null/);
  assert.doesNotMatch(source, /nasDirectFetchWorks|proxyNasFile|openNasDownload/);
  assert.match(source, /retry-after/);
  assert.equal(MUX_SOURCE_REDIRECT_TIMEOUT_MS < 15_000, true);
  assert.equal(muxEventContinuesQueue("video.asset.ready"), true);
  assert.equal(muxEventContinuesQueue("video.asset.created"), false);
  assert.equal(muxEventContinuesQueue("video.asset.errored"), false);
  assert.equal(muxEventContinuesQueue("video.asset.static_rendition.ready"), false);
  assert.match(webhook, /muxEventContinuesQueue/);
  assert.match(webhook, /startMuxBackfill\(\{ force: false, wait: true \}\)/);
  assert.match(webhook, /maxDuration = 120/);
  assert.match(backfill, /input\.wait/);
  assert.match(events, /status === "ready" \|\| status === "errored"/);
  const task = nas.slice(nas.indexOf("async function shareDownloadTarget"));
  assert.match(task.slice(0, task.indexOf("export async function createNasShareDownloadUrl")), /AbortSignal\.timeout/);
  assert.doesNotMatch(task.slice(0, 1200), /res\.text\(\)/);
  assert.doesNotMatch(sync, /submitMuxForImported/);
  assert.match(sync, /Left \$\{count\} finished/);
  assert.match(backfill, /nasSyncIsActive/);
  assert.match(backfill, /status: "deferred"/);
  assert.doesNotMatch(backfill, /allowDaytime|muxIngestAllowedAt|11pm/);
  assert.doesNotMatch(policy, /11pm|allowDaytime|America\/New_York/);
  const ingest = readFileSync(new URL("./mux-ingest.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("./mux-api.ts", import.meta.url), "utf8");
  const gate = readFileSync(new URL("./mux-nas-gate.ts", import.meta.url), "utf8");
  assert.match(ingest, /muxIngestPause/);
  assert.match(ingest, /releaseExpiredPreparing/);
  assert.match(ingest, /releaseMuxNasPull/);
  assert.match(ingest, /MUX_PREPARING_TIMEOUT_REASON/);
  assert.match(ingest, /promoteMuxUpgrade/);
  assert.match(ingest, /muxUpgradePassthrough/);
  assert.match(api, /MUX_MAX_RESOLUTION_TIER/);
  assert.doesNotMatch(api, /1080p/);
  assert.match(ingest, /nasSyncIsActive/);
  assert.doesNotMatch(ingest, /noteDaytimeMuxPull|allowDaytime/);
  assert.doesNotMatch(gate, /mux_daytime_grants|muxIngestAllowedAt/);
});

test("player and download modes fall back when Mux is missing or still working", () => {
  assert.equal(playerMode(null), "deferred");
  assert.equal(playerMode({ ...ready, status: "preparing", token: null, downloadUrl: null }), "deferred");
  assert.equal(playerMode({ ...ready, status: "preparing" }), "deferred");
  assert.equal(playerMode(ready), "mux");
  assert.equal(playerMode({ ...ready, token: null }), "deferred");
  assert.equal(playerMode({ ...ready, playbackId: null }), "deferred");
  assert.equal(playerMode({ ...ready, status: "errored" }), "deferred");
  assert.equal(playerMode({ ...ready, status: "errored", token: null, downloadUrl: null }), "deferred");
  assert.equal(nasFallbackUrl("/api/media/clip"), "/api/media/clip?fallback=1");
  assert.equal(nasFallbackUrl("/api/media/clip?rendition=720"), "/api/media/clip?rendition=720&fallback=1");
  assert.equal(downloadMode(null), "native");
  assert.equal(downloadMode(ready), "mux");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "preparing" }), "native");
  assert.equal(downloadMode({ ...ready, downloadUrl: "https://stream.mux.com/play/highest.mp4", staticStatus: "preparing" }), "native");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "errored" }), "native");
  assert.equal(isZipExcludedVideo("video"), true);
  assert.equal(isZipExcludedVideo("raw_video"), true);
  assert.equal(isZipExcludedVideo("photo"), false);
});

test("only a ready Mux video stays off the NAS until Play or a player error", () => {
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "ready", download: false }), false);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "ready", download: false, fallback: true }), true);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "errored", muxAssetId: "asset", download: false }), true);
  assert.equal(nasOriginalAllowed({ type: "video", muxStatus: "preparing", download: false }), true);
  assert.equal(nasOriginalAllowed({ type: "video", muxAssetId: "asset", muxStatus: null, download: false }), true);
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
  assert.match(player, /addEventListener\("error"/);
  assert.match(player, /nasFallbackUrl/);
  assert.match(mediaRoute, /fallback/);
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
  assert.match(videoOmissionNote(["a.mov"]), /up to 4K/);
  assert.match(videoOmissionNote(["a.mov"]), /a\.mov/);
  assert.equal(nasDownloadLooksPublic(206, "video/mp4"), true);
  assert.equal(nasDownloadLooksPublic(200, "application/json"), false);
  assert.equal(publicMuxStatus({ type: "photo", muxAssetId: null, muxPlaybackId: null, muxStatus: null, muxStaticStatus: null, muxError: null }), null);
});
