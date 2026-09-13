import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultNasCacheDir } from "./nas";
import { isVercelRuntime, useInProcessNasScheduler } from "./runtime";

test("local runtime uses the in-process NAS timer", () => {
  delete process.env.VERCEL;
  assert.equal(isVercelRuntime(), false);
  assert.equal(useInProcessNasScheduler(), true);
});

test("Vercel uses cron instead of setInterval", () => {
  process.env.VERCEL = "1";
  assert.equal(isVercelRuntime(), true);
  assert.equal(useInProcessNasScheduler(), false);
  delete process.env.VERCEL;
});

test("NAS cache defaults to /tmp on Vercel", () => {
  const previous = process.env.NAS_CACHE_DIR;
  delete process.env.NAS_CACHE_DIR;
  process.env.VERCEL = "1";
  assert.equal(defaultNasCacheDir(), "/tmp/nas-cache");
  process.env.NAS_CACHE_DIR = "/custom-cache";
  assert.equal(defaultNasCacheDir(), "/custom-cache");
  if (previous === undefined) delete process.env.NAS_CACHE_DIR;
  else process.env.NAS_CACHE_DIR = previous;
  delete process.env.VERCEL;
});
