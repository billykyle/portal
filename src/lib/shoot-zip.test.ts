import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { ZipFile } from "yazl";
import { contentDispositionAttachment, extrapolateApproxBytes } from "./shoot-zip";

test("sets a Safari-safe attachment filename", () => {
  const header = contentDispositionAttachment("2026-09-04 - 12 Wood View Drive.zip");
  assert.match(header, /filename="2026-09-04 - 12 Wood View Drive.zip"/);
  assert.match(header, /filename\*=UTF-8''2026-09-04%20-%2012%20Wood%20View%20Drive\.zip/);
});

test("extrapolates zip size from known files", () => {
  assert.equal(extrapolateApproxBytes(0, 0, 83), null);
  assert.equal(extrapolateApproxBytes(10_000_000, 10, 83), 83_000_000);
});

test("yazl streams a store zip", async () => {
  const zip = new ZipFile();
  zip.addBuffer(Buffer.from("hello"), "a.txt", { compress: false });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as Readable) {
    chunks.push(Buffer.from(chunk));
  }
  const out = Buffer.concat(chunks);
  assert.equal(out[0], 0x50);
  assert.equal(out[1], 0x4b);
  assert.ok(out.includes(Buffer.from("a.txt")));
  assert.ok(out.includes(Buffer.from("hello")));
});
