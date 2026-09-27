/** Bust a failed tile request so Safari/Chrome will try the proxy again. */
export function withThumbRetry(url: string, attempt: number) {
  if (attempt <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}retry=${attempt}`;
}

/**
 * Pause after the server spin-up still failed, before the tile asks once more.
 * The server plan already waits ~54s and pokes the heartbeat; this is the last try.
 */
export const THUMB_RETRY_DELAYS_MS = [12_000, 12_000] as const;

export const THUMB_RETRY_LIMIT = THUMB_RETRY_DELAYS_MS.length;

export function thumbRetryDelayMs(failedAttempt: number) {
  return THUMB_RETRY_DELAYS_MS[Math.min(Math.max(failedAttempt, 0), THUMB_RETRY_DELAYS_MS.length - 1)] ?? 15_000;
}

export function thumbRetryWindowMs() {
  return THUMB_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
}
