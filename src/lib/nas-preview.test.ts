import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptedPreview,
  bytesFromDb,
  MAX_PREVIEW_BYTES,
  NAS_SHARE_COOKIE_MAX_AGE_MS,
  previewCacheHeaders,
  readCappedBytes,
  shareSessionFresh,
  thumbCacheKey,
} from "./nas-preview";

test("thumb cache key follows the file path and stays short", () => {
  const full = thumbCacheKey("/volume1/Client Deliverables/Sam/Final/Full-03.jpg");
  const other = thumbCacheKey("/volume1/Client Deliverables/Sam/Final/Full-04.jpg");
  assert.equal(full.length, 32);
  assert.notEqual(full, other);
  assert.equal(full, thumbCacheKey("/volume1/Client Deliverables/Sam/Final/Full-03.jpg"));
});

test("accepts a small image preview and rejects a full original", () => {
  assert.equal(acceptedPreview("image/jpeg", 44_000), "image/jpeg");
  assert.equal(acceptedPreview("image/jpeg; charset=binary", 44_000), "image/jpeg");
  assert.equal(acceptedPreview("application/octet-stream", 44_000), "image/jpeg");
  assert.equal(acceptedPreview("", 44_000), "image/jpeg");
  assert.equal(acceptedPreview("image/jpeg", 0), null);
  assert.equal(acceptedPreview("image/jpeg", MAX_PREVIEW_BYTES + 1), null);
  assert.equal(acceptedPreview("application/json", 120), null);
  assert.equal(acceptedPreview("text/html", 200), null);
});

test("share cookie is fresh inside the window and stale after it", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  assert.equal(shareSessionFresh(now - 60_000, now, NAS_SHARE_COOKIE_MAX_AGE_MS), true);
  assert.equal(shareSessionFresh(now + 30_000, now, NAS_SHARE_COOKIE_MAX_AGE_MS), true);
  assert.equal(shareSessionFresh(now - NAS_SHARE_COOKIE_MAX_AGE_MS, now, NAS_SHARE_COOKIE_MAX_AGE_MS), false);
  assert.equal(shareSessionFresh(now + 5 * 60_000, now, NAS_SHARE_COOKIE_MAX_AGE_MS), false);
  assert.equal(shareSessionFresh(Number.NaN, now, NAS_SHARE_COOKIE_MAX_AGE_MS), false);
});

test("preview responses are publicly cacheable images", () => {
  const headers = previewCacheHeaders('image/jpeg', 'Full-03".jpg');
  assert.equal(headers["Content-Type"], "image/jpeg");
  assert.match(headers["Cache-Control"], /public/);
  assert.match(headers["Cache-Control"], /s-maxage=86400/);
  assert.doesNotMatch(headers["Cache-Control"], /private/);
  assert.equal(headers["Content-Disposition"], 'inline; filename="Full-03_.jpg"');
});

test("reads a small body and stops when the stream exceeds the preview cap", async () => {
  const small = await readCappedBytes(new Response(new Uint8Array([9, 8, 7])), 100);
  assert.deepEqual([...small], [9, 8, 7]);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1000));
      controller.enqueue(new Uint8Array(1000));
      controller.close();
    },
  });
  await assert.rejects(() => readCappedBytes(new Response(stream), 1500), /too large for a grid preview/);
});

test("normalizes bytea values coming back from Postgres", () => {
  assert.deepEqual([...bytesFromDb(Buffer.from([1, 2]))!], [1, 2]);
  assert.deepEqual([...bytesFromDb(new Uint8Array([3]))!], [3]);
  assert.deepEqual([...bytesFromDb("\\x00ff")!], [0, 255]);
  assert.equal(bytesFromDb("not-hex"), null);
});
