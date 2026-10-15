import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isNasUnreachableError } from "./nas-connect";
import {
  THUMB_NAS_CONCURRENCY,
  THUMB_NOT_READY_STATUS,
  THUMB_REQUEST_TIMEOUT_MS,
  ThumbnailNotReady,
  isThumbnailGeneratingBody,
  thumbNotReadyHeaders,
} from "./thumb-status";

test("still generating is a fast not-ready, not a dead NAS or a hard thumbnail error", () => {
  const error = new ThumbnailNotReady();
  assert.equal(error.name, "ThumbnailNotReady");
  assert.equal(isNasUnreachableError(error), false);
  assert.equal(isThumbnailGeneratingBody('{"code":200,"msg":"still generating, please wait"}'), true);
  assert.equal(isThumbnailGeneratingBody("Still generating, please wait"), true);
  assert.equal(isThumbnailGeneratingBody('{"msg":"file not found"}'), false);
  assert.ok(THUMB_REQUEST_TIMEOUT_MS <= 8_000);
  assert.ok(THUMB_NAS_CONCURRENCY <= 4);
  assert.equal(THUMB_NOT_READY_STATUS, 503);
  const headers = thumbNotReadyHeaders();
  assert.equal(headers["Retry-After"], "4");
  assert.equal(headers["Cache-Control"], "no-store");
});

test("the thumb route returns not-ready without waiting out the function limit", () => {
  const source = readFileSync("src/app/api/media/[id]/thumb/route.ts", "utf8");
  assert.match(source, /status: 503/);
  assert.match(source, /thumbNotReadyHeaders/);
  assert.match(source, /wait: false/);
  assert.match(source, /request: true/);
  assert.match(source, /maxDuration = 20/);
  assert.doesNotMatch(source, /withThumbSpinup/);
  const loader = readFileSync("src/lib/nas.ts", "utf8");
  assert.match(loader, /isThumbnailGeneratingBody/);
  assert.match(loader, /options\?\.request/);
  assert.match(loader, /THUMB_REQUEST_TIMEOUT_MS/);
});
