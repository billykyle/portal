import assert from "node:assert/strict";
import { test } from "node:test";
import { THUMB_RETRY_LIMIT, withThumbRetry } from "./thumb-retry";

test("leaves the first tile request unchanged", () => {
  assert.equal(withThumbRetry("/api/media/abc/thumb", 0), "/api/media/abc/thumb");
});

test("adds a retry query so the browser will refetch a failed tile", () => {
  assert.equal(withThumbRetry("/api/media/abc/thumb", 1), "/api/media/abc/thumb?retry=1");
  assert.equal(withThumbRetry("/api/media/abc/thumb?download=1", 2), "/api/media/abc/thumb?download=1&retry=2");
  assert.equal(THUMB_RETRY_LIMIT, 2);
});
