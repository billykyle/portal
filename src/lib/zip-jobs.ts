import { eq, lt } from "drizzle-orm";
import { db, sql } from "./db";
import { zipJobs } from "./db/schema";

const JOB_TTL_MS = 60 * 60 * 1000;

export const ZIP_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isZipJobId(value: string | null | undefined): value is string {
  return Boolean(value && ZIP_JOB_ID.test(value));
}

export type ZipJobRecord = {
  id: string;
  shootId: string;
  state: "preparing" | "downloading" | "done" | "failed";
  filesDone: number;
  filesTotal: number;
  bytes: number;
  filename: string;
  error?: string | null;
};

let tableReady: Promise<void> | null = null;

export async function ensureZipJobsTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS zip_jobs (
        id text PRIMARY KEY,
        shoot_id uuid NOT NULL REFERENCES shoots(id) ON DELETE CASCADE,
        state text NOT NULL,
        files_done integer NOT NULL DEFAULT 0,
        files_total integer NOT NULL DEFAULT 0,
        bytes integer NOT NULL DEFAULT 0,
        filename text NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.then(() => undefined);
  }
  return tableReady;
}

export async function purgeOldZipJobs() {
  await ensureZipJobsTable();
  const cutoff = new Date(Date.now() - JOB_TTL_MS);
  await db.delete(zipJobs).where(lt(zipJobs.createdAt, cutoff));
}

export async function startZipJob(job: Omit<ZipJobRecord, "state" | "filesDone" | "bytes" | "error">) {
  await ensureZipJobsTable();
  await purgeOldZipJobs();
  await db
    .insert(zipJobs)
    .values({
      id: job.id,
      shootId: job.shootId,
      state: "preparing",
      filesDone: 0,
      filesTotal: job.filesTotal,
      bytes: 0,
      filename: job.filename,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: zipJobs.id,
      set: {
        shootId: job.shootId,
        state: "preparing",
        filesDone: 0,
        filesTotal: job.filesTotal,
        bytes: 0,
        filename: job.filename,
        error: null,
        updatedAt: new Date(),
      },
    });
}

export async function updateZipJob(
  id: string,
  patch: Partial<Pick<ZipJobRecord, "state" | "filesDone" | "bytes" | "error">>,
) {
  await ensureZipJobsTable();
  await db
    .update(zipJobs)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(zipJobs.id, id));
}

export async function trackShootZipJob(options: {
  jobId: string | null;
  shootId: string;
  filesTotal: number;
  filename: string;
}) {
  if (!isZipJobId(options.jobId)) return {};
  await startZipJob({
    id: options.jobId,
    shootId: options.shootId,
    filesTotal: options.filesTotal,
    filename: options.filename,
  });
  const id = options.jobId;
  return {
    onFile: (info: { filesDone: number; filesTotal: number; bytes: number }) =>
      updateZipJob(id, { state: "downloading", ...info }),
    onDone: () => updateZipJob(id, { state: "done" }),
    onError: (error: Error) => updateZipJob(id, { state: "failed", error: error.message }),
  };
}

export async function getZipJob(id: string): Promise<ZipJobRecord | null> {
  await ensureZipJobsTable();
  const [row] = await db.select().from(zipJobs).where(eq(zipJobs.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    shootId: row.shootId,
    state: row.state as ZipJobRecord["state"],
    filesDone: row.filesDone,
    filesTotal: row.filesTotal,
    bytes: row.bytes,
    filename: row.filename,
    error: row.error,
  };
}
