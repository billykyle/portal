"use client";

import { Zip, ZipPassThrough } from "fflate";
import {
  downloadHref,
  estimateRemainingMs,
  uniqueZipEntryName,
  withZipJob,
  zipDownloadName,
  zipJobPercent,
  zipJobProgressPath,
  type DownloadFile,
  type ZipJobProgress,
  type ZipJobState,
} from "@/lib/download-all";

export type { DownloadFile, ZipJobProgress };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clickDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function saveBlob(data: BlobPart[] | Blob, filename: string, type = "application/zip") {
  const blob = data instanceof Blob ? data : new Blob(data, { type });
  const objectUrl = URL.createObjectURL(blob);
  clickDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

type ProgressEmitter = {
  emit: (partial: {
    state: ZipJobState;
    filesDone: number;
    filesTotal: number;
    filename: string;
    totalBytes?: number | null;
  }) => void;
  addBytes: (delta: number) => void;
  setBytes: (next: number) => void;
};

function createProgressTracker(
  started: number,
  onProgress?: (progress: ZipJobProgress) => void,
): ProgressEmitter {
  let bytes = 0;
  return {
    addBytes(delta: number) {
      bytes += delta;
    },
    setBytes(next: number) {
      bytes = Math.max(0, next);
    },
    emit(partial) {
      const elapsedMs = Date.now() - started;
      const remainingMs =
        partial.state === "downloading"
          ? estimateRemainingMs({
              filesDone: partial.filesDone,
              filesTotal: partial.filesTotal,
              bytes,
              elapsedMs,
              totalBytes: partial.totalBytes,
            })
          : null;
      onProgress?.({
        state: partial.state,
        filesDone: partial.filesDone,
        filesTotal: partial.filesTotal,
        filename: partial.filename,
        bytes,
        totalBytes: partial.totalBytes ?? null,
        elapsedMs,
        bytesPerSec: elapsedMs > 0 ? bytes / (elapsedMs / 1000) : 0,
        remainingMs,
        percent: zipJobPercent({
          state: partial.state,
          filesDone: partial.filesDone,
          filesTotal: partial.filesTotal,
          bytes,
          totalBytes: partial.totalBytes,
        }),
      });
    },
  };
}

async function readResponseBytes(
  response: Response,
  onBytes?: (delta: number) => void,
) {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onBytes?.(buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      onBytes?.(value.byteLength);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function fetchFileBytes(file: DownloadFile, onBytes?: (delta: number) => void) {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(file.url, { cache: "default" });
      if (!response.ok) throw new Error(`Could not read ${file.filename}`);
      return await readResponseBytes(response, onBytes);
    } catch (error) {
      last = error;
      await delay(400 * attempt);
    }
  }
  throw last instanceof Error ? last : new Error(`Could not read ${file.filename}`);
}

export async function saveOne(file: DownloadFile) {
  const response = await fetch(downloadHref(file.url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download ${file.filename}`);
  }
  const blob = await response.blob();
  saveBlob(blob, file.filename, blob.type || "application/octet-stream");
}

type ZipJobPayload = {
  state: ZipJobState;
  filesDone: number;
  filesTotal: number;
  bytes: number;
  filename: string;
  error?: string | null;
};

export async function downloadZipFromUrl(
  zipUrl: string,
  folderName: string,
  onProgress?: (progress: ZipJobProgress) => void,
) {
  const started = Date.now();
  const zipName = zipDownloadName(folderName);
  const jobId = crypto.randomUUID();
  const tracker = createProgressTracker(started, onProgress);
  tracker.emit({
    state: "preparing",
    filesDone: 0,
    filesTotal: 0,
    filename: zipName,
  });

  // Native attachment so Safari/iPhone streams ~470MB to disk and confirms once.
  startNativeZipDownload(withZipJob(zipUrl, jobId), folderName);

  const deadline = started + 6 * 60 * 1000;
  let seen = false;
  while (Date.now() < deadline) {
    await delay(400);
    const response = await fetch(zipJobProgressPath(jobId), { cache: "no-store" });
    if (response.status === 404) {
      if (seen) throw new Error(`Could not download ${zipName}`);
      continue;
    }
    if (!response.ok) throw new Error(`Could not download ${zipName}`);
    const job = (await response.json()) as ZipJobPayload;
    seen = true;
    tracker.setBytes(job.bytes);
    if (job.state === "failed") {
      throw new Error(job.error || `Could not download ${zipName}`);
    }
    tracker.emit({
      state: job.state,
      filesDone: job.filesDone,
      filesTotal: job.filesTotal,
      filename: job.filename || zipName,
    });
    if (job.state === "done") return;
  }
  throw new Error(`Could not download ${zipName}`);
}

export function startNativeZipDownload(zipUrl: string, _folderName: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("hidden", "");
  frame.setAttribute("aria-hidden", "true");
  frame.src = zipUrl;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 120_000);
}

export async function zipAndDownloadFiles(
  files: DownloadFile[],
  folderName: string,
  onProgress?: (progress: ZipJobProgress) => void,
) {
  const started = Date.now();
  const zipName = zipDownloadName(folderName);
  const tracker = createProgressTracker(started, onProgress);

  tracker.emit({
    state: "preparing",
    filesDone: 0,
    filesTotal: files.length,
    filename: zipName,
  });

  const chunks: Uint8Array[] = [];
  let resolveZip: () => void;
  let rejectZip: (error: Error) => void;
  const zipFinished = new Promise<void>((resolve, reject) => {
    resolveZip = resolve;
    rejectZip = reject;
  });
  const zip = new Zip((error, data, final) => {
    if (error) {
      rejectZip(error);
      return;
    }
    if (data.length) chunks.push(data);
    if (final) resolveZip();
  });

  const usedNames = new Set<string>();
  for (const [index, file] of files.entries()) {
    tracker.emit({
      state: "downloading",
      filesDone: index,
      filesTotal: files.length,
      filename: file.filename,
    });
    const data = await fetchFileBytes(file, (delta) => {
      tracker.addBytes(delta);
      tracker.emit({
        state: "downloading",
        filesDone: index,
        filesTotal: files.length,
        filename: file.filename,
      });
    });
    const entry = new ZipPassThrough(uniqueZipEntryName(file.filename, usedNames));
    zip.add(entry);
    entry.push(data, true);
    tracker.emit({
      state: "downloading",
      filesDone: index + 1,
      filesTotal: files.length,
      filename: file.filename,
    });
  }

  zip.end();
  await zipFinished;

  saveBlob(chunks as BlobPart[], zipName);
  tracker.emit({
    state: "done",
    filesDone: files.length,
    filesTotal: files.length,
    filename: zipName,
  });
}
