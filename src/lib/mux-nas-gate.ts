import { sql } from "./db";
import {
  MUX_NAS_PULL_LEASE_MS,
  muxIngestAllowedAt,
  muxIngestClosedRetryAfterSeconds,
  muxSourceDecision,
  muxSourceIngestAllowed,
} from "./mux-policy";
import { isNasSyncStale } from "./nas-sync-job";
import { ensureNasSyncJobsTable } from "./nas-sync-store";

const MUX_NAS_LOCK = 74001321;

let tableReady: Promise<void> | null = null;

async function ensureMuxNasPulls() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS mux_nas_pulls (
        media_id text PRIMARY KEY,
        acquired_at timestamptz NOT NULL DEFAULT now()
      )
    `
      .then(() =>
        sql`
          CREATE TABLE IF NOT EXISTS mux_daytime_grants (
            media_id text PRIMARY KEY,
            expires_at timestamptz NOT NULL
          )
        `,
      )
      .then(
        () => undefined,
        (error) => {
          tableReady = null;
          throw error;
        },
      );
  }
  return tableReady;
}

/** Let Mux fetch this one file outside 11pm–6am until the NAS pull lease ends. */
export async function noteDaytimeMuxPull(mediaId: string) {
  await ensureMuxNasPulls();
  const leaseSeconds = Math.round(MUX_NAS_PULL_LEASE_MS / 1000);
  await sql`
    INSERT INTO mux_daytime_grants (media_id, expires_at)
    VALUES (${mediaId}, now() + make_interval(secs => ${leaseSeconds}))
    ON CONFLICT (media_id) DO UPDATE
    SET expires_at = now() + make_interval(secs => ${leaseSeconds})
  `;
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Let at most one Mux original copy hit the NAS.
 * The lock is released when this transaction commits, before the redirect.
 */
export async function grantMuxNasPull(mediaId: string) {
  await ensureNasSyncJobsTable();
  await ensureMuxNasPulls();
  const now = new Date();
  const overnight = muxIngestAllowedAt(now);
  const closedRetryAfter = muxIngestClosedRetryAfterSeconds(now);
  const leaseSeconds = Math.round(MUX_NAS_PULL_LEASE_MS / 1000);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MUX_NAS_LOCK})`;
    await tx`
      DELETE FROM mux_nas_pulls
      WHERE acquired_at <= now() - make_interval(secs => ${leaseSeconds})
    `;
    await tx`DELETE FROM mux_daytime_grants WHERE expires_at <= now()`;
    const grants = await tx<{ media_id: string }[]>`
      SELECT media_id FROM mux_daytime_grants WHERE media_id = ${mediaId} AND expires_at > now()
    `;
    const ingestAllowed = muxSourceIngestAllowed({ overnight, daytimeGrant: grants.length > 0 });
    const running = await tx<{ updated_at: Date | string; db_now: Date | string }[]>`
      SELECT updated_at, now() AS db_now
      FROM nas_sync_jobs
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const current = running[0];
    const syncActive = current ? !isNasSyncStale(asDate(current.updated_at), asDate(current.db_now)) : false;
    const pulls = await tx<{ media_id: string }[]>`SELECT media_id FROM mux_nas_pulls`;
    const decision = muxSourceDecision({
      syncActive,
      ingestAllowed,
      closedRetryAfter,
      activePulls: pulls.length,
      thisMediaAlreadyPulling: pulls.some((row) => row.media_id === mediaId),
    });
    if (!decision.allow) return decision;
    await tx`
      INSERT INTO mux_nas_pulls (media_id, acquired_at)
      VALUES (${mediaId}, now())
      ON CONFLICT (media_id) DO UPDATE SET acquired_at = now()
    `;
    if (grants.length > 0) {
      await tx`
        UPDATE mux_daytime_grants
        SET expires_at = now() + make_interval(secs => ${leaseSeconds})
        WHERE media_id = ${mediaId}
      `;
    }
    return decision;
  });
}
