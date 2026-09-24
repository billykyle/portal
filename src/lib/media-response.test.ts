import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { test } from "node:test";
import { mediaContentType, mediaFileResponse, planMediaResponse, videoSourceType } from "./media-response";

test("shoot video types are playable in Chrome and Safari", () => {
  assert.equal(mediaContentType("188 33rd Street.mov"), "video/mp4");
  assert.equal(mediaContentType("walk.mp4"), "video/mp4");
  assert.equal(mediaContentType("clip.m4v"), "video/mp4");
  assert.equal(mediaContentType("clip.webm"), "video/webm");
  assert.equal(videoSourceType("188 33rd Street.mov"), "video/mp4");
  assert.equal(mediaContentType("Full-01.jpg"), "image/jpeg");
  assert.equal(mediaContentType("level-1.pdf"), "application/pdf");
  assert.notEqual(mediaContentType("tour.mov"), "video/quicktime");
});

test("video byte ranges answer 206 with the slice length", () => {
  const probe = planMediaResponse({
    size: 100,
    rangeHeader: "bytes=0-1",
    filename: "tour.mov",
    download: false,
  });
  assert.equal(probe.kind, "bytes");
  if (probe.kind !== "bytes") return;
  assert.equal(probe.status, 206);
  assert.deepEqual([probe.start, probe.end], [0, 1]);
  assert.equal(probe.headers["Content-Type"], "video/mp4");
  assert.equal(probe.headers["Content-Range"], "bytes 0-1/100");
  assert.equal(probe.headers["Content-Length"], "2");
  assert.equal(probe.headers["Accept-Ranges"], "bytes");
  assert.match(probe.headers["Cache-Control"] ?? "", /no-transform/);
  assert.match(probe.headers["Content-Disposition"] ?? "", /^inline;/);

  const open = planMediaResponse({
    size: 100,
    rangeHeader: "bytes=0-",
    filename: "tour.mp4",
    download: false,
  });
  assert.equal(open.kind, "bytes");
  if (open.kind !== "bytes") return;
  assert.equal(open.status, 206);
  assert.equal(open.headers["Content-Range"], "bytes 0-99/100");
  assert.equal(open.headers["Content-Length"], "100");

  const tail = planMediaResponse({
    size: 100,
    rangeHeader: "bytes=-10",
    filename: "tour.mp4",
    download: false,
  });
  assert.equal(tail.kind, "bytes");
  if (tail.kind !== "bytes") return;
  assert.deepEqual([tail.start, tail.end], [90, 99]);

  const whole = planMediaResponse({
    size: 100,
    rangeHeader: null,
    filename: "tour.mp4",
    download: true,
  });
  assert.equal(whole.kind, "bytes");
  if (whole.kind !== "bytes") return;
  assert.equal(whole.status, 200);
  assert.equal(whole.headers["Content-Range"], undefined);
  assert.match(whole.headers["Content-Disposition"] ?? "", /^attachment;/);

  const missing = planMediaResponse({
    size: 100,
    rangeHeader: "bytes=100-200",
    filename: "tour.mp4",
    download: false,
  });
  assert.equal(missing.status, 416);
  assert.equal(missing.kind === "unsatisfiable" && missing.headers["Content-Range"], "bytes */100");
});

test("a cached video file serves the requested range", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "media-range-"));
  const filePath = path.join(dir, "tour.mov");
  const bytes = Buffer.from("0123456789");
  await writeFile(filePath, bytes);
  try {
    const res = await mediaFileResponse(filePath, {
      filename: "tour.mov",
      download: false,
      rangeHeader: "bytes=0-1",
    });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("content-range"), "bytes 0-1/10");
    assert.equal(res.headers.get("content-length"), "2");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "01");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
