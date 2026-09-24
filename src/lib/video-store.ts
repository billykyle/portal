import { getSql } from "./db";
import type { VideoDisplaySize } from "./video-probe";
import { isVideoQuality, renditionPlayUrl, type VideoQuality } from "./video-renditions";

export type StoredRendition = {
  mediaId: string;
  quality: VideoQuality;
  nasRelativePath: string;
};

export async function listVideoRenditions(mediaIds: string[]): Promise<StoredRendition[]> {
  if (mediaIds.length === 0) return [];
  const sql = getSql();
  const rows = await sql<{ media_id: string; quality: string; nas_relative_path: string }[]>`
    SELECT media_id, quality, nas_relative_path
    FROM media_renditions
    WHERE media_id::text = ANY(${mediaIds})
  `;
  return rows.flatMap((row) => {
    if (!isVideoQuality(row.quality) || !row.nas_relative_path) return [];
    return [{ mediaId: row.media_id, quality: row.quality, nasRelativePath: row.nas_relative_path }];
  });
}

export async function videoPlaybackById(files: readonly { id: string; type: string }[]) {
  const ids = files.filter((file) => file.type === "video").map((file) => file.id);
  const rows = await listVideoRenditions(ids);
  const map = new Map<string, { quality: VideoQuality; url: string }[]>();
  for (const row of rows) {
    const list = map.get(row.mediaId) ?? [];
    list.push({ quality: row.quality, url: renditionPlayUrl(row.mediaId, row.quality) });
    map.set(row.mediaId, list);
  }
  return map;
}

export async function upsertVideoRendition(input: {
  mediaId: string;
  quality: VideoQuality;
  nasRelativePath: string;
  byteSize: number | null;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO media_renditions (media_id, quality, nas_relative_path, byte_size)
    VALUES (${input.mediaId}::uuid, ${input.quality}, ${input.nasRelativePath}, ${input.byteSize})
    ON CONFLICT (media_id, quality) DO UPDATE
    SET nas_relative_path = EXCLUDED.nas_relative_path,
        byte_size = EXCLUDED.byte_size,
        created_at = now()
  `;
}

export async function deleteVideoRendition(mediaId: string, quality: VideoQuality) {
  const sql = getSql();
  await sql`
    DELETE FROM media_renditions
    WHERE media_id = ${mediaId}::uuid AND quality = ${quality}
  `;
}

export async function listVideosMissingDimensions(limit: number) {
  const sql = getSql();
  return sql<{ id: string; filename: string; nas_relative_path: string }[]>`
    SELECT id, filename, nas_relative_path
    FROM media
    WHERE type = 'video'
      AND width IS NULL
      AND nas_relative_path LIKE '/%'
    ORDER BY filename
    LIMIT ${limit}
  `;
}

export async function listPortalVideos() {
  const sql = getSql();
  return sql<
    { id: string; filename: string; nas_relative_path: string | null; width: number | null; height: number | null }[]
  >`
    SELECT id, filename, nas_relative_path, width, height
    FROM media
    WHERE type = 'video'
    ORDER BY filename
  `;
}

/** `fill` keeps a size the player already learned. `replace` writes the probe result. */
export async function saveDisplaySize(mediaId: string, size: VideoDisplaySize, mode: "fill" | "correct" | "replace") {
  const sql = getSql();
  if (mode === "replace") {
    await sql`
      UPDATE media
      SET width = ${size.width}, height = ${size.height}
      WHERE id = ${mediaId}::uuid AND type = 'video'
    `;
    return;
  }
  if (mode === "fill") {
    await sql`
      UPDATE media
      SET width = ${size.width}, height = ${size.height}
      WHERE id = ${mediaId}::uuid AND type = 'video' AND width IS NULL
    `;
    return;
  }
  await sql`
    UPDATE media
    SET width = ${size.width}, height = ${size.height}
    WHERE id = ${mediaId}::uuid
      AND type = 'video'
      AND (
        width IS NULL
        OR height IS NULL
        OR height = 0
        OR abs((width::float8 / height) - ${size.width}::float8 / ${size.height}) > 0.015
      )
  `;
}
