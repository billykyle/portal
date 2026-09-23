import assert from "node:assert/strict";
import { test } from "node:test";
import { acquirePreviewSlot, PREVIEW_FETCH_CONCURRENCY, resetPreviewSlotsForTests } from "./preview-queue";

test("preview fetches wait once the concurrency cap is full", async () => {
  resetPreviewSlotsForTests();
  const releases = [];
  for (let index = 0; index < PREVIEW_FETCH_CONCURRENCY; index += 1) {
    releases.push(await acquirePreviewSlot());
  }
  let overflowed = false;
  const overflow = acquirePreviewSlot().then((release) => {
    overflowed = true;
    return release;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(overflowed, false);
  releases[0]?.();
  const release = await overflow;
  assert.equal(overflowed, true);
  release();
  for (const done of releases.slice(1)) done();
  resetPreviewSlotsForTests();
});
