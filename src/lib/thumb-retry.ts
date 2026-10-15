/** Bust a failed tile request so Safari/Chrome will try the proxy again. */
export function withThumbRetry(url: string, attempt: number) {
  if (attempt <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}retry=${attempt}`;
}

/**
 * Backoff after a not-ready thumbnail (503). The first pause matches Retry-After.
 * Later pauses grow, then stay at 16s, so a burst does not line up on one second.
 * Ten tries is a little over two minutes of NAS generation.
 */
export const THUMB_RETRY_DELAYS_MS = [4_000, 6_000, 9_000, 12_000, 16_000] as const;

export const THUMB_RETRY_LIMIT = 10;

export function thumbRetryDelayMs(failedAttempt: number) {
  const index = Math.min(Math.max(failedAttempt, 0), THUMB_RETRY_DELAYS_MS.length - 1);
  return THUMB_RETRY_DELAYS_MS[index] ?? 16_000;
}

/** `unitRandom` is 0..1. The delay stays within 20% of the base so retries spread out. */
export function thumbRetryDelayWithJitter(failedAttempt: number, unitRandom: number) {
  const base = thumbRetryDelayMs(failedAttempt);
  const unit = Number.isFinite(unitRandom) ? Math.min(1, Math.max(0, unitRandom)) : 0.5;
  const delta = Math.round(base * 0.2 * (unit * 2 - 1));
  return Math.max(1_000, base + delta);
}

export function thumbRetryWindowMs() {
  let sum = 0;
  for (let attempt = 0; attempt < THUMB_RETRY_LIMIT; attempt += 1) {
    sum += thumbRetryDelayMs(attempt);
  }
  return sum;
}
