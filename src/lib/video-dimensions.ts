import { readNasByteRange } from "./nas";
import { isNasFilePath } from "./nas-flags";
import type { ProbeChunk, VideoDisplaySize } from "./video-probe";
import { nextVideoProbe } from "./video-probe";
import { listVideosMissingDimensions, saveDisplaySize } from "./video-store";

const inflight = new Map<string, Promise<VideoDisplaySize | null>>();

/**
 * Read display width/height from the NAS file's moov atom.
 * Two small range reads (header, then moov) — not the picture data.
 */
export async function probeNasVideoDisplaySize(nasPath: string): Promise<VideoDisplaySize | null> {
  const chunks: ProbeChunk[] = [];
  let fileSize: number | null = null;
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const step = nextVideoProbe({ chunks, fileSize });
    if (step.action === "done") return step.size;
    if (step.action !== "fetch") return null;
    const key = `${step.start}-${step.end}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const got = await readNasByteRange(nasPath, step.start, step.end);
    if (!got || got.bytes.length === 0) return null;
    if (got.fileSize != null) fileSize = got.fileSize;
    chunks.push({ start: step.start, bytes: got.bytes });
  }
  const last = nextVideoProbe({ chunks, fileSize });
  return last.action === "done" ? last.size : null;
}

export async function ensureVideoDisplaySize(mediaId: string, nasPath: string | null) {
  if (!isNasFilePath(nasPath)) return null;
  const existing = inflight.get(mediaId);
  if (existing) return existing;
  const job = probeNasVideoDisplaySize(nasPath)
    .then(async (size) => {
      if (size) await saveDisplaySize(mediaId, size, "fill");
      return size;
    })
    .finally(() => {
      inflight.delete(mediaId);
    });
  inflight.set(mediaId, job);
  return job;
}

/** Cron backfill. Cheap header reads, not transcodes. */
export async function probeMissingVideoDimensions(options?: { limit?: number; budgetMs?: number }) {
  const limit = options?.limit ?? 4;
  const budgetMs = options?.budgetMs ?? 15_000;
  const started = Date.now();
  const pending = await listVideosMissingDimensions(limit);
  let probed = 0;
  for (const row of pending) {
    if (Date.now() - started > budgetMs) break;
    try {
      const size = await ensureVideoDisplaySize(row.id, row.nas_relative_path);
      if (size) probed += 1;
    } catch (error) {
      console.error(`Video dimensions failed for ${row.filename}:`, error);
    }
  }
  return { probed, considered: pending.length };
}
