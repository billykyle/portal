/**
 * A NAS thumbnail that is not an image yet.
 * The grid route returns this immediately. It does not sit in the function
 * until the 60s limit, and it does not keep a database connection while it waits.
 */
export class ThumbnailNotReady extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = THUMB_RETRY_AFTER_SECONDS) {
    super("Thumbnail is still generating.");
    this.name = "ThumbnailNotReady";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** UGOS answers shareThumbnail with this while it builds the preview. */
export function isThumbnailGeneratingBody(body: string) {
  return /still generating/i.test(body);
}

/**
 * How long one user-facing thumbnail fetch may talk to the NAS.
 * A miss, a timeout, or "still generating" becomes 503. The tile retries.
 */
export const THUMB_REQUEST_TIMEOUT_MS = 8_000;

/** `Retry-After` on the not-ready response. Tiles wait at least this long. */
export const THUMB_RETRY_AFTER_SECONDS = 4;

/** 503, not 202: a 202 can be cached as an empty success. This must not be stored. */
export const THUMB_NOT_READY_STATUS = 503;

/**
 * How many thumbnail fetches may hit the NAS at once, across isolates.
 * A shoot opened just after sync used to start one long function per file
 * and exhaust the Neon pool (about 80 at once on Oct 13).
 */
export const THUMB_NAS_CONCURRENCY = 4;

/**
 * A crashed fetch holds its job row this long, then another request may take it.
 * Longer than {@link THUMB_REQUEST_TIMEOUT_MS}, shorter than the old 2 minute lock
 * that kept a dead request in the pool.
 */
export const THUMB_JOB_LOCK_SECONDS = 30;

export function thumbNotReadyHeaders(retryAfterSeconds = THUMB_RETRY_AFTER_SECONDS) {
  const retry = String(retryAfterSeconds);
  return {
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store",
    "Retry-After": retry,
  };
}
