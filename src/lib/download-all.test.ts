import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downloadHref,
  estimateRemainingMs,
  formatBytes,
  formatDuration,
  formatZipStatus,
  publicShootZipPath,
  shootZipPath,
  uniqueZipEntryName,
  withZipJob,
  zipJobProgressPath,
  zipDownloadName,
  zipJobPercent,
} from "./download-all";

test("adds download=1 to media proxy URLs once", () => {
  assert.equal(downloadHref("/api/media/abc"), "/api/media/abc?download=1");
  assert.equal(downloadHref("/api/media/abc?download=1"), "/api/media/abc?download=1");
});

test("names the zip from the shoot folder", () => {
  assert.equal(zipDownloadName("2026-09-04 - 12 Wood View Drive"), "2026-09-04 - 12 Wood View Drive.zip");
  assert.equal(zipDownloadName("Sam/Wood:View"), "Sam-Wood-View.zip");
});

test("keeps zip entry names unique", () => {
  const used = new Set<string>();
  assert.equal(uniqueZipEntryName("Full-01.jpg", used), "Full-01.jpg");
  assert.equal(uniqueZipEntryName("Full-01.jpg", used), "Full-01-2.jpg");
});

test("builds shoot zip routes", () => {
  assert.equal(shootZipPath("abc"), "/api/shoots/abc/zip");
  assert.equal(publicShootZipPath("tok"), "/api/s/tok/zip");
  assert.equal(withZipJob("/api/s/tok/zip", "job-1"), "/api/s/tok/zip?job=job-1");
  assert.equal(zipJobProgressPath("job-1"), "/api/zip-jobs/job-1");
});

test("formats size, duration, and zip progress", () => {
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatDuration(90_000), "1m 30s");
  assert.equal(zipJobPercent({ state: "preparing", filesDone: 0, filesTotal: 83 }), 2);
  assert.equal(zipJobPercent({ state: "done", filesDone: 83, filesTotal: 83 }), 100);
  assert.equal(
    zipJobPercent({ state: "downloading", filesDone: 0, filesTotal: 83, bytes: 21_000_000, totalBytes: 83_000_000 }),
    27,
  );
  const remaining = estimateRemainingMs({
    filesDone: 21,
    filesTotal: 83,
    bytes: 21_000_000,
    elapsedMs: 21_000,
  });
  assert.ok(remaining && remaining > 50_000);
  const fromTotal = estimateRemainingMs({
    filesDone: 0,
    filesTotal: 83,
    bytes: 21_000_000,
    elapsedMs: 21_000,
    totalBytes: 83_000_000,
  });
  assert.ok(fromTotal && fromTotal > 50_000);
  assert.match(
    formatZipStatus({
      state: "downloading",
      filesDone: 21,
      filesTotal: 83,
      filename: "Full-19.jpg",
      bytes: 21_000_000,
      totalBytes: null,
      elapsedMs: 21_000,
      bytesPerSec: 1_000_000,
      remainingMs: 62_000,
      percent: 26,
    }),
    /Downloading 21 of 83 — Full-19.jpg/,
  );
  assert.match(
    formatZipStatus({
      state: "downloading",
      filesDone: 0,
      filesTotal: 83,
      filename: "2026-09-04 - 12 Wood View Drive.zip",
      bytes: 21_000_000,
      totalBytes: 83_000_000,
      elapsedMs: 21_000,
      bytesPerSec: 1_000_000,
      remainingMs: 62_000,
      percent: 27,
    }),
    /Downloading · 20\.0 MB of ~79\.2 MB/,
  );
  assert.equal(
    formatZipStatus({
      state: "preparing",
      filesDone: 0,
      filesTotal: 83,
      filename: "shoot.zip",
      bytes: 0,
      totalBytes: null,
      elapsedMs: 0,
      bytesPerSec: 0,
      remainingMs: null,
      percent: 2,
    }),
    "Preparing zip…",
  );
});
