import { randomUUID } from "crypto";
import { sql } from "./db";
import { ensureDb } from "./db/ensure";
import {
  MUX_BACKFILL_STALE_ERROR,
  isMuxBackfillStale,
  planMuxBackfillClaim,
  type MuxBackfillJobPublic,
  type MuxBackfillJobStatus,
} from "./mux-backfill-job";
import type { MuxBackfillReport } from "./mux-ingest";

const ADVISORY_LOCK = 74001321;

type JobRow = {
  id: string;
  status: MuxBackfillJobStatus;
  shoot_id: string | null;
  force: boolean;
  report: string | null;
  error: string | null;
  started_at: Date;
  updated_at: Date;
  finished_at: Date | null;
  db_now: Date;
};

export type MuxBackfillJobRecord = {
  id: string;
  status: MuxBackfillJobStatus;
  shootId: string | null;
  force: boolean;
  report: MuxBackfillReport | null;
  error: string | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  dbNow: Date;
};

function parseReport(value: string | null): MuxBackfillReport | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as MuxBackfillReport;
  } catch {
    return null;
  }
}

function asDate(value: Date | string) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function mapJob(row: JobRow): MuxBackfillJobRecord {
  return {
    id: row.id,
    status: row.status,
    shootId: row.shoot_id,
    force: row.force,
    report: parseReport(row.report),
    error: row.error,
    startedAt: asDate(row.started_at),
    updatedAt: asDate(row.updated_at),
    finishedAt: row.finished_at ? asDate(row.finished_at) : null,
    dbNow: asDate(row.db_now),
  };
}

export function toPublicMuxBackfillJob(job: MuxBackfillJobRecord): MuxBackfillJobPublic {
  return {
    id: job.id,
    status: job.status,
    shootId: job.shootId,
    force: job.force,
    report: job.report,
    error: job.error,
    startedAt: job.startedAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };
}

export async function claimMuxBackfillJob(input: { shootId: string | null; force: boolean }) {
  await ensureDb();
  const id = randomUUID();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK})`;
    const running = await tx<JobRow[]>`
      SELECT id, status, shoot_id, force, report, error, started_at, updated_at, finished_at, now() AS db_now
      FROM mux_backfill_jobs
      WHERE status = 'running'
      ORDER BY started_at DESC
      FOR UPDATE
    `;
    const mapped = running.map(mapJob);
    const now = mapped[0]?.dbNow ?? new Date();
    const plan = planMuxBackfillClaim(
      mapped.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
      now,
    );
    for (const staleId of plan.recoverIds) {
      await tx`
        UPDATE mux_backfill_jobs
        SET status = 'failed',
            error = ${MUX_BACKFILL_STALE_ERROR},
            finished_at = now(),
            updated_at = now()
        WHERE id = ${staleId} AND status = 'running'
      `;
    }
    if (plan.joinId) {
      const current = mapped.find((row) => row.id === plan.joinId);
      if (current) return { kind: "already_running" as const, job: current };
    }
    const inserted = await tx<JobRow[]>`
      INSERT INTO mux_backfill_jobs (id, status, shoot_id, force, started_at, updated_at)
      VALUES (${id}, 'running', ${input.shootId}, ${input.force}, now(), now())
      RETURNING id, status, shoot_id, force, report, error, started_at, updated_at, finished_at, now() AS db_now
    `;
    const job = inserted[0];
    if (!job) throw new Error("Mux backfill failed to start.");
    return { kind: "started" as const, job: mapJob(job) };
  });
}

export async function latestMuxBackfillJob() {
  await ensureDb();
  const rows = await sql<JobRow[]>`
    SELECT id, status, shoot_id, force, report, error, started_at, updated_at, finished_at, now() AS db_now
    FROM mux_backfill_jobs
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function recoverMuxBackfillJobIfStale(job: MuxBackfillJobRecord) {
  if (job.status !== "running" || !isMuxBackfillStale(job.updatedAt, job.dbNow)) {
    return { job, recoveredStale: false };
  }
  const failed = await sql<{ id: string }[]>`
    UPDATE mux_backfill_jobs
    SET status = 'failed',
        error = ${MUX_BACKFILL_STALE_ERROR},
        finished_at = now(),
        updated_at = now()
    WHERE id = ${job.id} AND status = 'running'
    RETURNING id
  `;
  if (!failed[0]) {
    const fresh = await latestMuxBackfillJob();
    return { job: fresh ?? job, recoveredStale: false };
  }
  return {
    job: {
      ...job,
      status: "failed" as const,
      error: MUX_BACKFILL_STALE_ERROR,
      finishedAt: job.dbNow,
      updatedAt: job.dbNow,
    },
    recoveredStale: true,
  };
}

export async function completeMuxBackfillJob(id: string, report: MuxBackfillReport) {
  await sql`
    UPDATE mux_backfill_jobs
    SET status = 'done',
        report = ${JSON.stringify(report)},
        error = null,
        finished_at = now(),
        updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
}

export async function failMuxBackfillJob(id: string, message: string) {
  await sql`
    UPDATE mux_backfill_jobs
    SET status = 'failed',
        error = ${message.slice(0, 500)},
        finished_at = now(),
        updated_at = now()
    WHERE id = ${id} AND status = 'running'
  `;
}
