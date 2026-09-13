export type DownloadFile = {
  url: string;
  filename: string;
};

export function downloadHref(url: string) {
  if (!url.startsWith("/api/media/")) return url;
  if (/[?&]download=/.test(url)) return url;
  return url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
}

export function isAppleMobile(userAgent = "", maxTouchPoints = 0) {
  if (/iP(hone|od|ad)/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function downloadDelayMs(fileCount: number, appleMobile: boolean) {
  if (appleMobile) return 1200;
  return fileCount > 20 ? 600 : 350;
}

export type DownloadProgress = {
  current: number;
  total: number;
  filename: string;
};

export function formatDownloadProgress(progress: DownloadProgress) {
  return `Saving ${progress.current} of ${progress.total} — ${progress.filename}`;
}

export function formatDownloadResult(saved: number, failed: number, total: number) {
  if (failed === 0) return `Saved ${saved} file${saved === 1 ? "" : "s"}.`;
  return `Saved ${saved} of ${total}. ${failed} failed — tap a photo to save those.`;
}
