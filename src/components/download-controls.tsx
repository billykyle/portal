"use client";

import {
  downloadDelayMs,
  downloadHref,
  formatDownloadProgress,
  formatDownloadResult,
  isAppleMobile,
  type DownloadFile,
} from "@/lib/download-all";

export type { DownloadFile };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBlob(file: DownloadFile) {
  const response = await fetch(downloadHref(file.url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download ${file.filename}`);
  }
  return response.blob();
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

function triggerDirectDownload(url: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("hidden", "true");
  frame.setAttribute("aria-hidden", "true");
  frame.src = url;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 60_000);
}

export async function saveOne(file: DownloadFile) {
  const blob = await fetchBlob(file);
  const objectUrl = URL.createObjectURL(blob);
  clickDownload(objectUrl, file.filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
}

async function saveOneWithRetry(file: DownloadFile, attempts = 3) {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await saveOne(file);
      return;
    } catch (error) {
      last = error;
      await delay(400 * attempt);
    }
  }
  throw last instanceof Error ? last : new Error(`Could not download ${file.filename}`);
}

export async function saveToFolder(
  files: DownloadFile[],
  folderName: string,
  onProgress?: (current: number, total: number, filename: string) => void,
) {
  const picker = (
    window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) return false;
  const root = await picker();
  const folder = await root.getDirectoryHandle(folderName.replace(/[\\/]/g, "-"), {
    create: true,
  });
  for (const [index, file] of files.entries()) {
    onProgress?.(index + 1, files.length, file.filename);
    const blob = await fetchBlob(file);
    const handle = await folder.getFileHandle(file.filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }
  return true;
}

export async function downloadAllFiles(
  files: DownloadFile[],
  folderName: string,
  onProgress?: (current: number, total: number, filename: string) => void,
) {
  try {
    const usedFolder = await saveToFolder(files, folderName, onProgress);
    if (usedFolder) {
      return { cancelled: false, saved: files.length, failed: 0, mode: "folder" as const };
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { cancelled: true, saved: 0, failed: 0, mode: "folder" as const };
    }
  }

  const appleMobile = isAppleMobile(navigator.userAgent, navigator.maxTouchPoints);
  const wait = downloadDelayMs(files.length, appleMobile);
  let saved = 0;
  let failed = 0;

  for (const [index, file] of files.entries()) {
    onProgress?.(index + 1, files.length, file.filename);
    try {
      if (appleMobile) {
        triggerDirectDownload(downloadHref(file.url));
      } else {
        await saveOneWithRetry(file);
      }
      saved += 1;
    } catch {
      failed += 1;
    }
    await delay(wait);
  }

  return { cancelled: false, saved, failed, mode: appleMobile ? "direct" : "blob" } as const;
}

export { formatDownloadProgress, formatDownloadResult };
