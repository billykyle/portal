import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { test } from "node:test";
import { displaySizeFromMoov, nextVideoProbe, type ProbeChunk } from "./video-probe";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
const hasFfmpeg = ffmpeg.status === 0;

function box(type: string, payload: Buffer) {
  const out = Buffer.alloc(8 + payload.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, 4, "latin1");
  payload.copy(out, 8);
  return out;
}

function tkhd(width: number, height: number, matrix: number[]) {
  const payload = Buffer.alloc(84);
  const matrixAt = 40;
  for (let index = 0; index < 9; index += 1) {
    payload.writeInt32BE(Math.round((matrix[index] ?? 0) * 65536), matrixAt + index * 4);
  }
  payload.writeUInt32BE(Math.round(width * 65536), matrixAt + 36);
  payload.writeUInt32BE(Math.round(height * 65536), matrixAt + 40);
  return box("tkhd", payload);
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const QUARTER = [0, 1, 0, -1, 0, 0, 0, 0, 1];

function moov(width: number, height: number, matrix = IDENTITY) {
  return box("moov", box("trak", tkhd(width, height, matrix)));
}

test("reads a 16:9 frame and a 9:16 frame from tkhd", () => {
  assert.deepEqual(displaySizeFromMoov(moov(1920, 1080)), { width: 1920, height: 1080 });
  assert.deepEqual(displaySizeFromMoov(moov(1080, 1920)), { width: 1080, height: 1920 });
  assert.deepEqual(displaySizeFromMoov(moov(1080, 1350)), { width: 1080, height: 1350 });
});

test("a 90 degree display matrix turns a stored landscape track upright", () => {
  assert.deepEqual(displaySizeFromMoov(moov(1920, 1080, QUARTER)), { width: 1080, height: 1920 });
});

test("ignores an audio track and keeps the video track", () => {
  const audio = box("trak", tkhd(0, 0, IDENTITY));
  const video = box("trak", tkhd(1080, 1920, IDENTITY));
  const bytes = box("moov", Buffer.concat([audio, video]));
  assert.deepEqual(displaySizeFromMoov(bytes), { width: 1080, height: 1920 });
});

test("skips a huge mdat and reads moov after it", () => {
  const ftyp = box("ftyp", Buffer.from("isom"));
  const mdatSize = 5_000_000;
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(mdatSize, 0);
  mdat.write("mdat", 4, 4, "latin1");
  const head = Buffer.concat([ftyp, mdat]);
  const movie = moov(1080, 1920);
  const moovAt = ftyp.length + mdatSize;
  const fileSize = moovAt + movie.length;
  const chunks: ProbeChunk[] = [{ start: 0, bytes: head }];

  const first = nextVideoProbe({ chunks, fileSize });
  assert.equal(first.action, "fetch");
  if (first.action !== "fetch") return;
  assert.equal(first.start, moovAt);
  chunks.push({ start: moovAt, bytes: movie });

  const done = nextVideoProbe({ chunks, fileSize });
  assert.deepEqual(done, { action: "done", size: { width: 1080, height: 1920 } });
});

test("reads a real moov-at-end file and a faststart vertical file", { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "portal-video-"));
  try {
    const horizontal = path.join(dir, "wide.mp4");
    const vertical = path.join(dir, "tall.mp4");
    const wide = spawnSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", horizontal],
      { stdio: "ignore" },
    );
    const tall = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=180x320:d=0.2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        vertical,
      ],
      { stdio: "ignore" },
    );
    assert.equal(wide.status, 0);
    assert.equal(tall.status, 0);

    const wideBytes = await readFile(horizontal);
    const moovAt = wideBytes.indexOf(Buffer.from("moov"));
    const mdatAt = wideBytes.indexOf(Buffer.from("mdat"));
    assert.ok(moovAt > mdatAt, "default ffmpeg mp4 keeps moov after the picture");
    const prefixEnd = Math.max(32, mdatAt + 8);
    assert.ok(prefixEnd < moovAt);
    const chunks: ProbeChunk[] = [{ start: 0, bytes: wideBytes.subarray(0, prefixEnd) }];
    let guard = 0;
    let size: { width: number; height: number } | null = null;
    while (guard < 4) {
      const step = nextVideoProbe({ chunks, fileSize: wideBytes.length });
      if (step.action === "done") {
        size = step.size;
        break;
      }
      assert.equal(step.action, "fetch");
      if (step.action !== "fetch") break;
      chunks.push({ start: step.start, bytes: wideBytes.subarray(step.start, step.end + 1) });
      guard += 1;
    }
    assert.deepEqual(size, { width: 320, height: 180 });

    const tallBytes = await readFile(vertical);
    const tallStep = nextVideoProbe({
      chunks: [{ start: 0, bytes: tallBytes }],
      fileSize: tallBytes.length,
    });
    assert.deepEqual(tallStep, { action: "done", size: { width: 180, height: 320 } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
