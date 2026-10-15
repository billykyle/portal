import assert from "node:assert/strict";
import { test } from "node:test";
import {
  THUMB_RETRY_LIMIT,
  thumbRetryDelayMs,
  thumbRetryDelayWithJitter,
  thumbRetryWindowMs,
  withThumbRetry,
} from "./thumb-retry";

test("leaves the first tile request unchanged", () => {
  assert.equal(withThumbRetry("/api/media/abc/thumb", 0), "/api/media/abc/thumb");
});

test("adds a retry query so the browser will refetch a failed tile", () => {
  assert.equal(withThumbRetry("/api/media/abc/thumb", 1), "/api/media/abc/thumb?retry=1");
  assert.equal(withThumbRetry("/api/media/abc/thumb?download=1", 2), "/api/media/abc/thumb?download=1&retry=2");
  assert.equal(THUMB_RETRY_LIMIT, 10);
  assert.equal(thumbRetryDelayMs(0), 4_000);
  assert.equal(thumbRetryDelayMs(1), 6_000);
  assert.equal(thumbRetryDelayMs(4), 16_000);
  assert.equal(thumbRetryDelayMs(9), 16_000);
  assert.equal(thumbRetryDelayWithJitter(0, 0.5), 4_000);
  assert.equal(thumbRetryDelayWithJitter(0, 0), 3_200);
  assert.equal(thumbRetryDelayWithJitter(0, 1), 4_800);
  assert.ok(thumbRetryWindowMs() > 120_000);
});
