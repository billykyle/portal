/** First rows are in the HTML so they start before hydration. */
export const PREVIEW_EAGER_COUNT = 6;

/** Additional tiles near the viewport share this many NAS preview requests. */
export const PREVIEW_FETCH_CONCURRENCY = 3;

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
