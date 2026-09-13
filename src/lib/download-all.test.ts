import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downloadDelayMs,
  downloadHref,
  formatDownloadProgress,
  formatDownloadResult,
  isAppleMobile,
} from "./download-all";

test("adds download=1 to media proxy URLs once", () => {
  assert.equal(downloadHref("/api/media/abc"), "/api/media/abc?download=1");
  assert.equal(downloadHref("/api/media/abc?download=1"), "/api/media/abc?download=1");
  assert.equal(downloadHref("/samples/maple-exterior.jpg"), "/samples/maple-exterior.jpg");
});

test("detects iPhone and iPad", () => {
  assert.equal(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5), true);
  assert.equal(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
  assert.equal(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
});

test("spaces Safari downloads farther apart", () => {
  assert.equal(downloadDelayMs(83, true), 1200);
  assert.ok(downloadDelayMs(83, false) < 1200);
});

test("progress and result copy", () => {
  assert.equal(
    formatDownloadProgress({ current: 12, total: 83, filename: "Full-12.jpg" }),
    "Saving 12 of 83 — Full-12.jpg",
  );
  assert.equal(formatDownloadResult(83, 0, 83), "Saved 83 files.");
  assert.match(formatDownloadResult(80, 3, 83), /Saved 80 of 83/);
});
