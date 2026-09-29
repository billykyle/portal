import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMediaSize, rawVideoHeaderDetail } from "./raw-video-size";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

test("formats raw clip totals in KB, MB, and GB", () => {
  assert.equal(formatMediaSize(512), "512 B");
  assert.equal(formatMediaSize(1.5 * KB), "1.5 KB");
  assert.equal(formatMediaSize(800 * MB), "800 MB");
  assert.equal(formatMediaSize(4.2 * GB), "4.2 GB");
  assert.equal(formatMediaSize(12 * GB), "12 GB");
});

test("raw video header names the file count and the combined size", () => {
  assert.equal(
    rawVideoHeaderDetail([
      { byteSize: Math.round(2.1 * GB) },
      { byteSize: Math.round(2.1 * GB) },
    ]),
    "2 files · 4.2 GB",
  );
  assert.equal(rawVideoHeaderDetail([{ byteSize: 800 * MB }]), "1 file · 800 MB");
  assert.equal(rawVideoHeaderDetail([{ byteSize: null }, { byteSize: GB }]), "2 files");
  assert.equal(rawVideoHeaderDetail([]), "0 files");
});
