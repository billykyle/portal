import { spawn } from "child_process";
import { mkdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";
import { nasEnabled } from "../src/lib/nas-flags";
import { probeMissingVideoDimensions } from "../src/lib/video-dimensions";
import type { VideoDisplaySize } from "../src/lib/video-probe";
import {
  displaySizeFromFfprobe,
  ffmpegRenditionArgs,
  nasPathToLocal,
  renditionNasPath,
  renditionTargets,
  type VideoQuality,
} from "../src/lib/video-renditions";
import { deleteVideoRendition, listPortalVideos, saveDisplaySize, upsertVideoRendition } from "../src/lib/video-store";

const SETUP = `
Lighter video files are built on a computer that can see the NAS share, not on Vercel.

1. Install ffmpeg on that computer (Billy's Mac, or any always-on machine with the share mounted).
   macOS: brew install ffmpeg
   Debian/Ubuntu: sudo apt install ffmpeg
2. Mount the same share the portal already reads, so client folders are ordinary folders on disk.
3. In that machine's .env.local (do not set these on Vercel):
   NAS_FS_ROOT=/path/to/the/mounted/share
   NAS_FS_PREFIX=/nas/path/prefix/that/is/above/that/folder
   Example: a portal path /volume1/Client Deliverables/Sam Lepore/.../walk.mov
   and a mount whose top level is "Sam Lepore" means:
   NAS_FS_ROOT="/Volumes/Client Deliverables"
   NAS_FS_PREFIX="/volume1/Client Deliverables"
4. From this repo run: npm run nas:renditions
   It writes .portal-renditions/<id>-720.mp4 and -1080.mp4 beside each video and records them in Postgres.
   Sync skips that hidden folder, so the files are not new shoots or extra videos.
5. Reload the shoot. Playback uses 720p when it exists (1080p if that is the only lighter file).
   Download still saves the original. There is no quality menu in the player.

The player already letterboxes nothing: it uses the real frame shape as soon as width and height
are known. Those come from the file header (the 10-minute sync, and the first time a video opens)
and do not need ffmpeg. Until a rendition exists, playback streams the original.
`.trim();

function run(command: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => resolve({ code: 1, stdout: "", stderr: error.message }));
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function commandOk(command: string) {
  const result = await run(command, ["-version"]);
  return result.code === 0;
}

async function probeFile(filePath: string): Promise<VideoDisplaySize | null> {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_streams",
    "-of",
    "json",
    filePath,
  ]);
  if (result.code !== 0) return null;
  try {
    return displaySizeFromFfprobe(JSON.parse(result.stdout));
  } catch {
    return null;
  }
}

async function transcode(input: string, output: string, quality: VideoQuality) {
  await mkdir(path.dirname(output), { recursive: true });
  const part = `${output}.part`;
  const attempt = async (withAudio: boolean) => {
    const result = await run("ffmpeg", ffmpegRenditionArgs(input, part, quality, withAudio));
    if (result.code !== 0) {
      await rm(part, { force: true }).catch(() => undefined);
      throw new Error(result.stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${result.code}`);
    }
  };
  try {
    await attempt(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/matches no streams|stream specifier|audio/i.test(message)) throw error;
    await attempt(false);
  }
  await rename(part, output);
}

async function fileMtime(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 ? info.mtimeMs : null;
  } catch {
    return null;
  }
}

async function main() {
  const fsRoot = process.env.NAS_FS_ROOT?.trim() ?? "";
  const prefix = process.env.NAS_FS_PREFIX?.trim() ?? "";
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Number.POSITIVE_INFINITY;
  await ensureDb();
  const ffmpegOk = await commandOk("ffmpeg");
  const probeOk = await commandOk("ffprobe");
  if (!fsRoot || !ffmpegOk || !probeOk) {
    console.log(SETUP);
    if (!ffmpegOk || !probeOk) console.log("ffmpeg / ffprobe was not found on PATH.");
    if (!fsRoot) console.log("NAS_FS_ROOT is not set.");
    if (nasEnabled()) {
      const probed = await probeMissingVideoDimensions({ limit: 200, budgetMs: 120_000 });
      console.log(`Stored display size for ${probed.probed} of ${probed.considered} video(s) missing it.`);
    }
    await sql.end({ timeout: 5 });
    return;
  }

  const videos = await listPortalVideos();
  let built = 0;
  let failed = 0;
  let seen = 0;
  for (const video of videos) {
    if (seen >= limit) break;
    const nasPath = video.nas_relative_path;
    if (!nasPath?.startsWith("/")) continue;
    seen += 1;
    const local = nasPathToLocal(nasPath, fsRoot, prefix);
    if (!local) {
      failed += 1;
      console.error(`Skipped ${video.filename}: NAS path is outside NAS_FS_PREFIX (${nasPath}).`);
      continue;
    }
    const sourceMtime = await fileMtime(local);
    if (sourceMtime == null) {
      failed += 1;
      console.error(`Skipped ${video.filename}: not on disk at ${local} (NAS path ${nasPath}).`);
      continue;
    }
    const size = await probeFile(local);
    if (!size) {
      failed += 1;
      console.error(`Skipped ${video.filename}: ffprobe could not read a picture size.`);
      continue;
    }
    await saveDisplaySize(video.id, size, "replace");
    const targets = new Set(renditionTargets(size));
    for (const quality of ["1080", "720"] as const) {
      const remote = renditionNasPath(nasPath, quality);
      const output = nasPathToLocal(remote, fsRoot, prefix);
      if (!output) {
        failed += 1;
        console.error(`Skipped ${quality} for ${video.filename}: rendition path is outside the mount.`);
        continue;
      }
      if (!targets.has(quality)) {
        await rm(output, { force: true }).catch(() => undefined);
        await deleteVideoRendition(video.id, quality);
        continue;
      }
      const outputMtime = await fileMtime(output);
      if (outputMtime != null && outputMtime >= sourceMtime) {
        const info = await stat(output);
        await upsertVideoRendition({
          mediaId: video.id,
          quality,
          nasRelativePath: remote,
          byteSize: info.size,
        });
        console.log(`Kept ${quality}p ${video.filename}`);
        continue;
      }
      try {
        await transcode(local, output, quality);
        const info = await stat(output);
        await upsertVideoRendition({
          mediaId: video.id,
          quality,
          nasRelativePath: remote,
          byteSize: info.size,
        });
        built += 1;
        console.log(`Built ${quality}p ${video.filename} (${info.size} bytes)`);
      } catch (error) {
        failed += 1;
        console.error(`Failed ${quality}p ${video.filename}:`, error instanceof Error ? error.message : error);
      }
    }
  }
  console.log(`Renditions built: ${built}. Failures: ${failed}. Videos considered: ${seen}.`);
  await sql.end({ timeout: 5 });
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  try {
    await sql.end({ timeout: 1 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
