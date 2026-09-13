export type DownloadFile = {
  url: string;
  filename: string;
  type?: "photo" | "video" | "floor_plan";
};

export type ZipJobState = "preparing" | "downloading" | "done" | "failed";

export type ZipJobProgress = {
  state: ZipJobState;
  filesDone: number;
  filesTotal: number;
  filename: string;
  bytes: number;
  totalBytes: number | null;
  elapsedMs: number;
  bytesPerSec: number;
  remainingMs: number | null;
  percent: number;
};

export function downloadHref(url: string) {
  if (!url.startsWith("/api/media/")) return url;
  if (/[?&]download=/.test(url)) return url;
  return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
}

export function shootZipPath(shootId: string) {
  return `/api/shoots/${shootId}/zip`;
}

export function publicShootZipPath(token: string) {
  return `/api/s/${token}/zip`;
}

export function withZipJob(zipUrl: string, jobId: string) {
  return zipUrl.includes("?") ? `${zipUrl}&job=${jobId}` : `${zipUrl}?job=${jobId}`;
}

export function zipJobProgressPath(jobId: string) {
  return `/api/zip-jobs/${jobId}`;
}

export function zipDownloadName(folderName: string) {
  const safe = folderName
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "shoot"}.zip`;
}

export function uniqueZipEntryName(filename: string, used: Set<string>) {
  const base = filename.replace(/[\\/]+/g, "-") || "file";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  let next = `${stem}-${index}${ext}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem}-${index}${ext}`;
  }
  used.add(next);
  return next;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function zipJobPercent(input: {
  state: ZipJobState;
  filesDone: number;
  filesTotal: number;
  bytes?: number;
  totalBytes?: number | null;
}) {
  if (input.state === "done") return 100;
  if (input.state === "failed") return 0;
  if (input.filesTotal <= 0 && !input.totalBytes) return input.state === "preparing" ? 2 : 8;
  if (input.state === "preparing") return 2;
  if (input.totalBytes && input.totalBytes > 0) {
    return Math.min(99, Math.round(((input.bytes ?? 0) / input.totalBytes) * 96) + 3);
  }
  if (input.filesTotal > 0) {
    return Math.min(94, Math.round((input.filesDone / input.filesTotal) * 90) + 4);
  }
  return 8;
}

export function estimateRemainingMs(input: {
  filesDone: number;
  filesTotal: number;
  bytes: number;
  elapsedMs: number;
  totalBytes?: number | null;
}) {
  if (input.elapsedMs <= 0 || input.bytes <= 0) return null;
  const bytesPerSec = input.bytes / (input.elapsedMs / 1000);
  if (bytesPerSec <= 0) return null;
  if (input.totalBytes && input.totalBytes > input.bytes) {
    return ((input.totalBytes - input.bytes) / bytesPerSec) * 1000;
  }
  if (input.filesDone <= 0) return null;
  const bytesPerFile = input.bytes / input.filesDone;
  const remainingBytes = bytesPerFile * Math.max(0, input.filesTotal - input.filesDone);
  return (remainingBytes / bytesPerSec) * 1000;
}

export function formatZipStatus(progress: ZipJobProgress) {
  if (progress.state === "preparing") return "Preparing zip…";
  if (progress.state === "done") return `Saved ${progress.filename}`;
  if (progress.state === "failed") return "Download failed. Try again, or Download a single file.";
  const speed = progress.bytesPerSec > 0 ? ` · ${formatBytes(progress.bytesPerSec)}/s` : "";
  const eta =
    progress.remainingMs != null ? ` · ${formatDuration(progress.remainingMs)} left` : "";
  const size =
    progress.totalBytes && progress.totalBytes > 0
      ? `${formatBytes(progress.bytes)} of ~${formatBytes(progress.totalBytes)}`
      : formatBytes(progress.bytes);
  if (progress.filesTotal > 1 && progress.filesDone > 0) {
    const label = progress.filename.toLowerCase().endsWith(".zip")
      ? `Downloading ${progress.filesDone} of ${progress.filesTotal}`
      : `Downloading ${progress.filesDone} of ${progress.filesTotal} — ${progress.filename}`;
    return `${label} · ${size}${speed}${eta}`;
  }
  return `Downloading · ${size}${speed}${eta}`;
}

export function emptyZipProgress(
  state: ZipJobState,
  filesTotal: number,
  filename: string,
): ZipJobProgress {
  return {
    state,
    filesDone: 0,
    filesTotal,
    filename,
    bytes: 0,
    totalBytes: null,
    elapsedMs: 0,
    bytesPerSec: 0,
    remainingMs: null,
    percent: zipJobPercent({ state, filesDone: 0, filesTotal }),
  };
}
