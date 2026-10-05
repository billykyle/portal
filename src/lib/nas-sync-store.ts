import { randomUUID } from "crypto";
import { sql } from "./db";
import {
  NAS_SYNC_STALE_ERROR,
  isNasSyncJobId,
  isNasSyncStale,
  parseNasSyncSummary,
  planNasSyncClaim,
  type NasSyncJobPublic,
  type NasSyncJobStatus,
  type NasSyncSource,
  type NasSyncSummary,
} from "./nas-sync-job";

const ADVISORY_LOCK = 74001320;

export type NasSyncJobRecord = {
  id: string;
  status: NasSyncJobStatus;
  source: NasSyncSource;
  phase: string;
  detail: string;
  clientsSeen: number;
  shootsSeen: number;
  summary: NasSyncSummary | null;
  error: string | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  dbNow: Date;
};

type JobSqlRow = {
  id: string;
  status: string;
  source: string;
  phase: string;
  detail: string;
  clients_seen: number;
  shoots_seen: number;
  summary: string | null;
  error: string | null;
  started_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
  db_now: Date | string;
};

let tableReady: Promise<void> | null = null;

export async function ensureNasSyncJobsTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS nas_sync_jobs (
          id text PRIMARY KEY,
          status text NOT NULL,
          source text NOT NULL,
          phase text NOT NULL,
          detail text NOT NULL DEFAULT '',
          clients_seen integer NOT NULL DEFAULT 0,
          shoots_seen integer NOT NULL DEFAULT 0,
          summary text,
          error text,
          started_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          finished_at timestamptz
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS nas_sync_jobs_started_idx ON nas_sync_jobs (started_at DESC)`;
      try {
        await sql`
          CREATE UNIQUE INDEX IF NOT EXISTS nas_sync_one_running_idx
          ON nas_sync_jobs (status)
          WHERE status = 'running'
        `;
      } catch (error) {
        console.error("NAS sync one-running index skipped", error);
      }
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function mapJob(row: JobSqlRow): NasSyncJobRecord {
  const status: NasSyncJobStatus = row.status === "done" || row.status === "failed" ? row.status : "running";
  const source: NasSyncSource = row.source === "mcp" || row.source === "cli" ? row.source : "admin";
  return {
    id: row.id,
    status,
    source,
    phase: row.phase,
    detail: row.detail,
    clientsSeen: row.clients_seen,
    shootsSeen: row.shoots_seen,
    summary: parseNasSyncSummary(row.summary),
    error: row.error,
    startedAt: asDate(row.started_at),
    updatedAt: asDate(row.updated_at),
    finishedAt: row.finished_at ? asDate(row.finished_at) : null,
    dbNow: asDate(row.db_now),
  };
}

export function toPublicNasSyncJob(row: NasSyncJobRecord): NasSyncJobPublic {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    phase: row.phase,
    detail: row.detail,
    clientsSeen: row.clientsSeen,
    shootsSeen: row.shootsSeen,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    error: row.error,
    summary: row.summary,
  };
}

async function selectJob(id: string) {
  const rows = await sql<JobSqlRow[]>`
    SELECT
      id, status, source, phase, detail, clients_seen, shoots_seen, summary, error,
      started_at, updated_at, finished_at, now() AS db_now
    FROM nas_sync_jobs
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function claimNasSyncJob(source: NasSyncSource): Promise<
  | { kind: "started"; job: NasSyncJobRecord; recoveredStaleJobId: string | null }
  | { kind: "already_running"; job: NasSyncJobRecord; recoveredStaleJobId: string | null }
> {
  await ensureNasSyncJobsTable();
  const id = randomUUID();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK})`;
    const running = await tx<JobSqlRow[]>`
      SELECT
        id, status, source, phase, detail, clients_seen, shoots_seen, summary, error,
        started_at, updated_at, finished_at, now() AS db_now
      FROM nas_sync_jobs
      WHERE status = 'running'
      ORDER BY started_at DESC
      FOR UPDATE
    `;
    const mapped = running.map(mapJob);
    const plan = planNasSyncClaim(
      mapped.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
      mapped[0]?.dbNow ?? new Date(),
    );
    let recoveredStaleJobId: string | null = null;
    for (const staleId of plan.recoverIds) {
      const failed = await tx<{ id: string }[]>`
        UPDATE nas_sync_jobs
        SET status = 'failed',
            phase = 'failed',
            error = ${NAS_SYNC_STALE_ERROR},
            finished_at = now(),
            updated_at = now()
        WHERE id = ${staleId} AND status = 'running'
        RETURNING id
      `;
      if (failed[0] && !recoveredStaleJobId) {
        recoveredStaleJobId = failed[0].id;
        console.log(`NAS sync stale lock cleared (${failed[0].id})`);
      }
    }
    if (plan.joinId) {
      const current = mapped.find((row) => row.id === plan.joinId);
      if (current) return { kind: "already_running" as const, job: current, recoveredStaleJobId };
    }
    const inserted = await tx<JobSqlRow[]>`
      INSERT INTO nas_sync_jobs (
        id, status, source, phase, detail, clients_seen, shoots_seen, started_at, updated_at
      ) VALUES (
        ${id}, 'running', ${source}, 'starting', 'Starting NAS sync', 0, 0, now(), now()
      )
      RETURNING
        id, status, source, phase, detail, clients_seen, shoots_seen, summary, error,
        started_at, updated_at, finished_at, now() AS db_now
    `;
    const job = inserted[0];
    if (!job) throw new Error("NAS sync failed to start.");
    return { kind: "started" as const, job: mapJob(job), recoveredStaleJobId };
  });
}

export async function getNasSyncJob(id: string): Promise<NasSyncJobRecord | null> {
  if (!isNasSyncJobId(id)) return null;
  await ensureNasSyncJobsTable();
  return selectJob(id);
}

export async function latestNasSyncJob(): Promise<NasSyncJobRecord | null> {
  await ensureNasSyncJobsTable();
  const rows = await sql<JobSqlRow[]>`
    SELECT
      id, status, source, phase, detail, clients_seen, shoots_seen, summary, error,
      started_at, updated_at, finished_at, now() AS db_now
    FROM nas_sync_jobs
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return rows[0] ? mapJob(rows[0]) : null;
}

/** Mark a crashed running job failed. A fresh heartbeat is left alone. */
export async function recoverNasSyncJobIfStale(job: NasSyncJobRecord): Promise<{
  job: NasSyncJobRecord;
  recoveredStale: boolean;
}> {
  if (job.status !== "running" || !isNasSyncStale(job.updatedAt, job.dbNow)) {
    return { job, recoveredStale: false };
  }
  const failed = await sql<{ id: string }[]>`
    UPDATE nas_sync_jobs
    SET status = 'failed',
        phase = 'failed',
        error = ${NAS_SYNC_STALE_ERROR},
        finished_at = now(),
        updated_at = now()
    WHERE id = ${job.id} AND status = 'running'
    RETURNING id
  `;
  if (!failed[0]) {
    const current = await selectJob(job.id);
    return { job: current ?? job, recoveredStale: false };
  }
  console.log(`NAS sync stale lock cleared (${job.id})`);
  const next = await selectJob(job.id);
  return { job: next ?? job, recoveredStale: true };
}

export async function nasSyncJobIsRunning(id: string) {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM nas_sync_jobs WHERE id = ${id} AND status = 'running' LIMIT 1
  `;
  return Boolean(rows[0]);
}

export async function heartbeatNasSyncJob(id: string) {
  const updated = await sql`
    UPDATE nas_sync_jobs
    SET updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
  return updated.count > 0;
}

export async function recordNasSyncProgress(
  id: string,
  progress: { phase: string; detail: string; clientsSeen: number; shootsSeen: number },
) {
  const updated = await sql`
    UPDATE nas_sync_jobs
    SET phase = ${progress.phase},
        detail = ${progress.detail},
        clients_seen = ${progress.clientsSeen},
        shoots_seen = ${progress.shootsSeen},
        updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
  return updated.count > 0;
}

export async function completeNasSyncJob(
  id: string,
  input: { status: "done" | "failed"; phase: string; error?: string | null; summary?: NasSyncSummary | null },
) {
  const updated = await sql`
    UPDATE nas_sync_jobs
    SET status = ${input.status},
        phase = ${input.phase},
        error = ${input.error ?? null},
        summary = ${input.summary ? JSON.stringify(input.summary) : null},
        detail = ${input.status === "done" ? "Finished" : "Failed"},
        finished_at = now(),
        updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
  return updated.count > 0;
}
