import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downloadMode,
  isZipExcludedVideo,
  muxDownloadStem,
  muxIngestDecision,
  muxStaticDownloadUrl,
  nasDownloadLooksPublic,
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

test("player and download modes fall back when Mux is missing or still working", () => {
  assert.equal(playerMode(null), "native");
  assert.equal(playerMode({ ...ready, status: "preparing", token: null, downloadUrl: null }), "processing");
  assert.equal(playerMode(ready), "mux");
  assert.equal(playerMode({ ...ready, status: "errored", token: null, downloadUrl: null }), "native");
  assert.equal(downloadMode(null), "native");
  assert.equal(downloadMode(ready), "mux");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "preparing" }), "preparing");
  assert.equal(downloadMode({ ...ready, downloadUrl: null, staticStatus: "errored" }), "native");
  assert.equal(isZipExcludedVideo("video"), true);
  assert.equal(isZipExcludedVideo("raw_video"), true);
  assert.equal(isZipExcludedVideo("photo"), false);
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
