import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultNasCacheDir } from "./nas";
import { isVercelRuntime } from "./runtime";

test("local runtime is not Vercel", () => {
  delete process.env.VERCEL;
  assert.equal(isVercelRuntime(), false);
});

test("VERCEL=1 is the Vercel runtime", () => {
  process.env.VERCEL = "1";
  assert.equal(isVercelRuntime(), true);
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
