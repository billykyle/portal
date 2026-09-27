/** First tiles are in the HTML so they start before hydration. Kept small so a cold NAS is not hit all at once. */
export const PREVIEW_EAGER_COUNT = 2;

/** Tiles near the viewport, and any retry, share this many NAS preview requests. */
export const PREVIEW_FETCH_CONCURRENCY = 2;

/** Start a tile shortly before it scrolls into view. */
export const PREVIEW_NEAR_MARGIN = "240px";

type Release = () => void;

let active = 0;
const waiting: Array<(release: Release) => void> = [];

function grant(resolve: (release: Release) => void) {
  active += 1;
  let released = false;
  resolve(() => {
    if (released) return;
    released = true;
    active -= 1;
    const next = waiting.shift();
    if (next) grant(next);
  });
}

export function acquirePreviewSlot() {
  return new Promise<Release>((resolve) => {
    if (active < PREVIEW_FETCH_CONCURRENCY) grant(resolve);
    else waiting.push(resolve);
  });
}

export function resetPreviewSlotsForTests() {
  active = 0;
  waiting.length = 0;
}
