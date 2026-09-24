import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { test } from "node:test";
import { videoSourceType } from "./media-response";
import { playbackSourceType } from "./video-playback";
import { displaySizeFromFfprobe } from "./video-renditions";
import {
  availableQualities,
  ffmpegRenditionArgs,
  nasPathToLocal,
  renditionNasPath,
  renditionTargets,
  resolvePlaybackQuality,
  selectServedVideo,
  shouldReportDisplaySize,
  videoFrameStyle,
} from "./video-renditions";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
const hasFfmpeg = ffmpeg.status === 0;

test("the player source type matches the media response", () => {
  for (const filename of ["walk.mov", "walk.mp4", "clip.m4v", "clip.webm", "notes.txt"]) {
    assert.equal(playbackSourceType(filename), videoSourceType(filename));
  }
});

test("auto plays the lighter rendition and download stays on the original", () => {
  assert.equal(resolvePlaybackQuality("auto", ["1080", "720"]), "720");
  assert.equal(resolvePlaybackQuality("auto", ["1080"]), "1080");
  assert.equal(resolvePlaybackQuality("auto", []), "original");
  assert.equal(resolvePlaybackQuality("1080", ["720"]), "original");
  assert.equal(resolvePlaybackQuality("original", ["720", "1080"]), "original");
  assert.deepEqual(availableQualities([{ quality: "720" }, { quality: "poster" }]), ["720"]);

  const served = selectServedVideo({
    download: true,
    rendition: "720",
    original: { path: "/share/walk.mov", filename: "walk.mov" },
    renditions: [{ quality: "720", path: "/share/.portal-renditions/abc-720.mp4" }],
  });
  assert.equal(served.kind, "original");
  assert.equal(served.path, "/share/walk.mov");
  assert.equal(served.filename, "walk.mov");

  const play = selectServedVideo({
    download: false,
    rendition: "720",
    original: { path: "/share/walk.mov", filename: "walk.mov" },
    renditions: [{ quality: "720", path: "/share/.portal-renditions/abc-720.mp4" }],
  });
  assert.equal(play.kind, "rendition");
  assert.match(play.path, /\.portal-renditions\//);
  assert.match(play.filename, /\.720\.mp4$/);
});

test("rendition files live in a hidden folder beside the original", () => {
  const nasPath = "/volume1/Client Deliverables/Sam/2026.09.04 - 12 Wood/walk.mov";
  const file = renditionNasPath(nasPath, "720");
  assert.match(file, /\/\.portal-renditions\/[a-f0-9]+-720\.mp4$/);
  assert.equal(file.startsWith("/volume1/Client Deliverables/Sam/2026.09.04 - 12 Wood/"), true);
  assert.notEqual(renditionNasPath(nasPath, "1080"), file);
});

test("does not upscale, and a 4K original gets both 1080p and 720p", () => {
  assert.deepEqual(renditionTargets({ width: 3840, height: 2160 }), ["1080", "720"]);
  assert.deepEqual(renditionTargets({ width: 2160, height: 3840 }), ["1080", "720"]);
  assert.deepEqual(renditionTargets({ width: 1920, height: 1080 }), ["720"]);
  assert.deepEqual(renditionTargets({ width: 1080, height: 1920 }), ["720"]);
  assert.deepEqual(renditionTargets({ width: 1280, height: 720 }), []);
});

test("frames use the real ratio and stay inside the viewport", () => {
  const vertical = videoFrameStyle(1080, 1920);
  const horizontal = videoFrameStyle(1920, 1080);
  const square = videoFrameStyle(1000, 1000);
  assert.equal(vertical.aspectRatio, "1080 / 1920");
  assert.equal(horizontal.aspectRatio, "1920 / 1080");
  assert.equal(square.aspectRatio, "1000 / 1000");
  assert.match(vertical.width, /0\.562500/);
  assert.match(horizontal.width, /1\.777778/);
  assert.match(vertical.maxHeight, /78dvh/);
  assert.equal(videoFrameStyle(null, null).aspectRatio, undefined);
});

test("reports a display size when it is missing or the shape disagrees", () => {
  assert.equal(shouldReportDisplaySize(null, { width: 1080, height: 1920 }), true);
  assert.equal(shouldReportDisplaySize({ width: 1080, height: 1920 }, { width: 540, height: 960 }), false);
  assert.equal(shouldReportDisplaySize({ width: 1920, height: 1080 }, { width: 1080, height: 1920 }), true);
  assert.equal(shouldReportDisplaySize(null, { width: 8, height: 8 }), false);
});

test("maps a NAS path onto the mounted share and refuses to climb out", () => {
  const root = "/mnt/share";
  const prefix = "/volume1/Client Deliverables";
  assert.equal(
    nasPathToLocal(`${prefix}/Sam/walk.mov`, root, prefix),
    path.join(root, "Sam", "walk.mov"),
  );
  assert.equal(nasPathToLocal("/elsewhere/walk.mov", root, prefix), null);
  assert.equal(nasPathToLocal(`${prefix}/Sam/../../etc/passwd`, root, prefix), null);
});

test("ffprobe rotation swaps a landscape coded size", () => {
  assert.deepEqual(
    displaySizeFromFfprobe({
      streams: [{ codec_type: "video", width: 1920, height: 1080, side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }] }],
    }),
    { width: 1080, height: 1920 },
  );
  assert.deepEqual(
    displaySizeFromFfprobe({ streams: [{ codec_type: "video", width: 1080, height: 1920 }] }),
    { width: 1080, height: 1920 },
  );
});

test("ffmpeg args keep aspect, cap the short side, and move moov to the front", () => {
  const args = ffmpegRenditionArgs("in.mov", "out.mp4", "720", true);
  assert.ok(args.includes("+faststart"));
  assert.match(args.join("\n"), /min\(720,iw\)/);
  assert.match(args.join("\n"), /min\(720,ih\)/);
  assert.ok(args.includes("libx264"));
  assert.equal(args.at(-1), "out.mp4");
});

test("a 1080p landscape master becomes a 720p file", { skip: !hasFfmpeg }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "portal-rendition-"));
  const input = path.join(dir, "source.mp4");
  const output = path.join(dir, "out.mp4");
  try {
    const made = spawnSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "color=c=green:s=1920x1080:d=0.3", "-c:v", "libx264", "-pix_fmt", "yuv420p", input],
      { stdio: "ignore" },
    );
    assert.equal(made.status, 0);
    const encoded = spawnSync("ffmpeg", ffmpegRenditionArgs(input, output, "720", false), { stdio: "ignore" });
    assert.equal(encoded.status, 0);
    const info = await stat(output);
    assert.ok(info.size > 0);
    const probe = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", output],
      { encoding: "utf8" },
    );
    assert.equal(probe.stdout.trim(), "1280x720");
    const bytes = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=format_name", "-of", "default=nw=1", output], {
      encoding: "utf8",
    });
    assert.match(bytes.stdout, /mp4|mov/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
