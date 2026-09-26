import { createHash } from "crypto";
import type postgres from "postgres";
import { getSql } from "./db";
import { shareSessionMatchesRelay } from "./nas-relay";

/** size_type=1 thumbs are ~40KB. Reject anything that looks like a full original. */
export const MAX_PREVIEW_BYTES = 1_500_000;

/** Reuse a share cookie this long before one isolate is allowed to mint another. */
export const NAS_SHARE_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

const NAS_SHARE_LOCK_KEY = 84201017;
const PREVIEW_WAIT_ATTEMPTS = 25;
const PREVIEW_WAIT_MS = 300;

export class PreviewStoreUnavailable extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Preview store unavailable.");
    this.name = "PreviewStoreUnavailable";
  }
}

export type ShareSession = {
  cookie: string;
  host: string;
  rootPath: string;
  updatedAt: number;
};

export type StoredPreview = {
  bytes: Buffer;
  contentType: string;
};

let schemaReady: Promise<void> | null = null;

export function thumbCacheKey(nasPath: string) {
  return createHash("sha256").update(`${nasPath}#t1`).digest("hex").slice(0, 32);
}

export function shareSessionFresh(updatedAtMs: number, nowMs: number, maxAgeMs: number) {
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - updatedAtMs;
  return age >= -60_000 && age < maxAgeMs;
}

/** Content type to store, or null when the payload is not a grid preview. */
export function acceptedPreview(header: string, byteLength: number) {
  if (!Number.isFinite(byteLength) || byteLength <= 0 || byteLength > MAX_PREVIEW_BYTES) return null;
  const raw = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (raw.includes("json") || raw.startsWith("text/") || raw.includes("html") || raw.includes("xml")) return null;
  if (raw.startsWith("image/")) return raw;
  return "image/jpeg";
}

export function previewCacheHeaders(contentType: string, filename: string) {
  const safe = filename.replace(/["\\]/g, "_");
  return {
    "Content-Type": contentType,
    "Content-Disposition": `inline; filename="${safe}"`,
    "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options": "nosniff",
  };
}

export function previewImageResponse(bytes: Buffer, contentType: string, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: previewCacheHeaders(contentType, filename),
  });
}

export async function readCappedBytes(response: Response, maxBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared) {
    const size = Number(declared);
    if (Number.isFinite(size) && size > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`NAS thumbnail was ${size} bytes — too large for a grid preview.`);
    }
  }
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new Error(`NAS thumbnail was ${bytes.length} bytes — too large for a grid preview.`);
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`NAS thumbnail was ${total} bytes — too large for a grid preview.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function bytesFromDb(value: unknown) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string" && value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  return null;
}

export function ensurePreviewSchema() {
  if (!process.env.DATABASE_URL) {
    return Promise.reject(new PreviewStoreUnavailable(new Error("DATABASE_URL is not set.")));
  }
  schemaReady ??= createPreviewTables().catch((error) => {
    schemaReady = null;
    console.error("Preview schema unavailable:", error);
    throw error instanceof PreviewStoreUnavailable ? error : new PreviewStoreUnavailable(error);
  });
  return schemaReady;
}

async function createPreviewTables() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS nas_share_session (
      id text PRIMARY KEY,
      cookie text NOT NULL,
      host text NOT NULL,
      root_path text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS media_thumbs (
      media_id uuid PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
      nas_path text NOT NULL,
      cache_key text NOT NULL,
      content_type text NOT NULL,
      bytes bytea NOT NULL,
      byte_size integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS media_thumb_jobs (
      media_id uuid PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
      locked_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

function sessionFromRow(row: {
  cookie: string;
  host: string;
  root_path: string | null;
  updated_at: Date | string;
} | undefined): ShareSession | null {
  if (!row?.cookie || !row.host) return null;
  const updatedAt = row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(String(row.updated_at));
  return {
    cookie: row.cookie,
    host: row.host,
    rootPath: row.root_path ?? "",
    updatedAt,
  };
}

async function selectShareSession(q: postgres.Sql) {
  const rows = await q<
    { cookie: string; host: string; root_path: string | null; updated_at: Date | string }[]
  >`SELECT cookie, host, root_path, updated_at FROM nas_share_session WHERE id = 'current' LIMIT 1`;
  return sessionFromRow(rows[0]);
}

export async function readShareSession(q: postgres.Sql) {
  await ensurePreviewSchema();
  return selectShareSession(q);
}

async function writeShareSession(
  q: postgres.Sql,
  session: { cookie: string; host: string; rootPath: string },
) {
  await q`
    INSERT INTO nas_share_session (id, cookie, host, root_path, updated_at)
    VALUES ('current', ${session.cookie}, ${session.host}, ${session.rootPath}, now())
    ON CONFLICT (id) DO UPDATE SET
      cookie = EXCLUDED.cookie,
      host = EXCLUDED.host,
      root_path = EXCLUDED.root_path,
      updated_at = now()
  `;
}

export async function readFreshShareSession(ignoreCookie?: string) {
  try {
    const shared = await readShareSession(getSql());
    if (!shared) return null;
    if (ignoreCookie && shared.cookie === ignoreCookie) return null;
    if (!shareSessionFresh(shared.updatedAt, Date.now(), NAS_SHARE_COOKIE_MAX_AGE_MS)) return null;
    return shared;
  } catch (error) {
    if (!(error instanceof PreviewStoreUnavailable)) {
      console.error("NAS share session read failed:", error);
    }
    return null;
  }
}

/**
 * One verify at a time across isolates. A second caller waits, then reuses the
 * cookie the first caller just stored instead of minting another.
 */
export async function lockAndRefreshShareCookie(
  failedCookie: string | undefined,
  verify: () => Promise<{ cookie: string; host: string; rootPath: string }>,
  expectedHost?: string,
) {
  await ensurePreviewSchema();
  let reserved: postgres.ReservedSql | null = null;
  try {
    try {
      reserved = await getSql().reserve();
      await reserved`SELECT pg_advisory_lock(${NAS_SHARE_LOCK_KEY}::bigint)`;
    } catch (error) {
      throw new PreviewStoreUnavailable(error);
    }
    const current = await selectShareSession(reserved);
    if (
      current &&
      shareSessionFresh(current.updatedAt, Date.now(), NAS_SHARE_COOKIE_MAX_AGE_MS) &&
      shareSessionMatchesRelay(current, expectedHost, failedCookie)
    ) {
      return current;
    }
    const session = await verify();
    try {
      await writeShareSession(reserved, session);
    } catch (error) {
      console.error("Could not store the NAS share cookie:", error);
    }
    return { ...session, updatedAt: Date.now() };
  } finally {
    if (reserved) {
      try {
        await reserved`SELECT pg_advisory_unlock(${NAS_SHARE_LOCK_KEY}::bigint)`;
      } catch {
        /* The connection is already unusable. */
      }
      reserved.release();
    }
  }
}

export async function readStoredPreview(mediaId: string, nasPath: string): Promise<StoredPreview | null> {
  await ensurePreviewSchema();
  const key = thumbCacheKey(nasPath);
  const rows = await getSql()<
    { bytes: unknown; content_type: string; cache_key: string; nas_path: string }[]
  >`
    SELECT bytes, content_type, cache_key, nas_path
    FROM media_thumbs
    WHERE media_id = ${mediaId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.cache_key !== key || row.nas_path !== nasPath) return null;
  const bytes = bytesFromDb(row.bytes);
  const contentType = bytes ? acceptedPreview(row.content_type, bytes.length) : null;
  if (!bytes || !contentType) return null;
  return { bytes, contentType };
}

async function writeStoredPreview(mediaId: string, nasPath: string, bytes: Buffer, contentType: string) {
  await getSql()`
    INSERT INTO media_thumbs (media_id, nas_path, cache_key, content_type, bytes, byte_size)
    VALUES (
      ${mediaId}::uuid,
      ${nasPath},
      ${thumbCacheKey(nasPath)},
      ${contentType},
      ${bytes},
      ${bytes.length}
    )
    ON CONFLICT (media_id) DO UPDATE SET
      nas_path = EXCLUDED.nas_path,
      cache_key = EXCLUDED.cache_key,
      content_type = EXCLUDED.content_type,
      bytes = EXCLUDED.bytes,
      byte_size = EXCLUDED.byte_size,
      created_at = now()
  `;
}

async function claimPreviewJob(mediaId: string) {
  await ensurePreviewSchema();
  const rows = await getSql()`
    INSERT INTO media_thumb_jobs (media_id, locked_at)
    VALUES (${mediaId}::uuid, now())
    ON CONFLICT (media_id) DO UPDATE
      SET locked_at = now()
      WHERE media_thumb_jobs.locked_at < now() - interval '2 minutes'
    RETURNING media_id
  `;
  return rows.length > 0 ? "claimed" : "busy";
}

async function previewJobBusy(mediaId: string) {
  const rows = await getSql()`
    SELECT 1 AS ok
    FROM media_thumb_jobs
    WHERE media_id = ${mediaId}::uuid
      AND locked_at >= now() - interval '2 minutes'
  `;
  return rows.length > 0;
}

async function releasePreviewJob(mediaId: string) {
  await getSql()`DELETE FROM media_thumb_jobs WHERE media_id = ${mediaId}::uuid`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStoredPreview(mediaId: string, nasPath: string) {
  for (let attempt = 0; attempt < PREVIEW_WAIT_ATTEMPTS; attempt += 1) {
    await sleep(PREVIEW_WAIT_MS);
    const row = await readStoredPreview(mediaId, nasPath);
    if (row) return row;
    if (!(await previewJobBusy(mediaId))) return null;
  }
  return null;
}

function acceptLoaded(loaded: { bytes: Buffer; contentType: string }): StoredPreview {
  const contentType = acceptedPreview(loaded.contentType, loaded.bytes.length);
  if (!contentType) {
    throw new Error(
      `NAS thumbnail was ${loaded.bytes.length} bytes (${loaded.contentType || "unknown type"}) — not a grid preview.`,
    );
  }
  return { bytes: loaded.bytes, contentType };
}

export async function listPhotoPreviewBackfill(limit: number) {
  await ensurePreviewSchema();
  return getSql()<{ id: string; filename: string; nas_relative_path: string }[]>`
    SELECT m.id, m.filename, m.nas_relative_path
    FROM media m
    LEFT JOIN media_thumbs t ON t.media_id = m.id AND t.nas_path = m.nas_relative_path
    WHERE m.type = 'photo'
      AND m.nas_relative_path LIKE '/%'
      AND t.media_id IS NULL
    ORDER BY m.sort_order, m.filename
    LIMIT ${limit}
  `;
}

/**
 * Serve a stored small preview, or fetch one and keep it. Parallel requests
 * for the same photo wait on the in-flight job instead of each hitting the NAS.
 */
export async function ensureStoredPreview(input: {
  mediaId: string;
  nasPath: string;
  loadBytes: () => Promise<{ bytes: Buffer; contentType: string }>;
}): Promise<StoredPreview> {
  try {
    const existing = await readStoredPreview(input.mediaId, input.nasPath);
    if (existing) return existing;
  } catch (error) {
    if (!(error instanceof PreviewStoreUnavailable)) throw error;
    return acceptLoaded(await input.loadBytes());
  }

  let ownsJob = false;
  try {
    const claim = await claimPreviewJob(input.mediaId);
    if (claim === "busy") {
      const waited = await waitForStoredPreview(input.mediaId, input.nasPath);
      if (waited) return waited;
      const retry = await claimPreviewJob(input.mediaId);
      if (retry === "busy") {
        const waitedAgain = await waitForStoredPreview(input.mediaId, input.nasPath);
        if (waitedAgain) return waitedAgain;
        return acceptLoaded(await input.loadBytes());
      }
    }
    ownsJob = true;
    const raced = await readStoredPreview(input.mediaId, input.nasPath);
    if (raced) return raced;
    const loaded = acceptLoaded(await input.loadBytes());
    try {
      await writeStoredPreview(input.mediaId, input.nasPath, loaded.bytes, loaded.contentType);
    } catch (error) {
      console.error("Could not store shoot preview:", error);
    }
    return loaded;
  } catch (error) {
    if (error instanceof PreviewStoreUnavailable) return acceptLoaded(await input.loadBytes());
    throw error;
  } finally {
    if (ownsJob) {
      try {
        await releasePreviewJob(input.mediaId);
      } catch (error) {
        console.error("Could not release preview job:", error);
      }
    }
  }
}
