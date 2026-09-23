import { isNasFilePath } from "./nas-flags";
import { loadNasThumbnailBytes } from "./nas";
import { ensureStoredPreview, listPhotoPreviewBackfill } from "./nas-preview";

/**
 * Store small photo previews that are not in Postgres yet.
 * Existing shoots fill in here (cron / `npm run nas:sync:warm`) and on first view.
 */
export async function warmMissingPreviews(options?: { limit?: number; budgetMs?: number }) {
  const limit = options?.limit ?? 20;
  const budgetMs = options?.budgetMs ?? 20_000;
  const started = Date.now();
  const pending = await listPhotoPreviewBackfill(limit);
  let warmed = 0;
  for (const row of pending) {
    if (Date.now() - started > budgetMs) break;
    const nasPath = row.nas_relative_path;
    if (!isNasFilePath(nasPath)) continue;
    try {
      await ensureStoredPreview({
        mediaId: row.id,
        nasPath,
        loadBytes: () => loadNasThumbnailBytes(nasPath),
      });
      warmed += 1;
    } catch (error) {
      console.error(`Preview warm failed for ${row.filename}:`, error);
    }
  }
  return { warmed, considered: pending.length };
}
