import { podcastCoverUrl } from "@/lib/podcast-episode";
import { resolveMediaThumbUrl } from "@/lib/media";

export function coverUrlByShoot(
  rows: Array<{
    shootId: string;
    id: string;
    filename: string;
    type: string;
    sortOrder: number;
    width: number | null;
    height: number | null;
    url: string;
    nasRelativePath: string | null;
  }>,
) {
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.shootId) ?? [];
    list.push(row);
    grouped.set(row.shootId, list);
  }
  const covers = new Map<string, string | null>();
  for (const [shootId, files] of grouped) {
    covers.set(
      shootId,
      podcastCoverUrl(
        files.map((file) => ({
          id: file.id,
          filename: file.filename,
          type: file.type,
          sortOrder: file.sortOrder,
          width: file.width,
          height: file.height,
          thumbUrl: resolveMediaThumbUrl(file),
        })),
      ),
    );
  }
  return covers;
}
