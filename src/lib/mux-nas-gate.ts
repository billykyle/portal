import { sql } from "./db";
import { MUX_NAS_PULL_LEASE_MS, muxIngestAllowedAt, muxIngestClosedRetryAfterSeconds, muxSourceDecision } from "./mux-policy";
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
    `.then(
      () => undefined,
      (error) => {
        tableReady = null;
        throw error;
      },
    );
  }
  return tableReady;
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
  const ingestAllowed = muxIngestAllowedAt(now);
  const closedRetryAfter = muxIngestClosedRetryAfterSeconds(now);
  const leaseSeconds = Math.round(MUX_NAS_PULL_LEASE_MS / 1000);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MUX_NAS_LOCK})`;
    await tx`
      DELETE FROM mux_nas_pulls
      WHERE acquired_at <= now() - make_interval(secs => ${leaseSeconds})
    `;
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
    return decision;
  });
}
