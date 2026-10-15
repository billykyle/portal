import { after } from "next/server";
import { muxSetupBlocksIngest, type MuxBackfillJobPublic } from "./mux-backfill-job";
import {
  claimMuxBackfillJob,
  completeMuxBackfillJob,
  failMuxBackfillJob,
  latestMuxBackfillJob,
  recoverMuxBackfillJobIfStale,
  toPublicMuxBackfillJob,
} from "./mux-backfill-store";
import { backfillMuxVideos, ensureMuxSetup, type MuxBackfillReport } from "./mux-ingest";
import { MUX_INGEST_SYNC_REASON } from "./mux-policy";
import { nasSyncIsActive } from "./nas-sync-store";

export type MuxBackfillStart =
  | { status: "blocked"; report: MuxBackfillReport }
  | { status: "deferred"; job: null; reason: string }
  | { status: "started" | "already_running"; job: MuxBackfillJobPublic }
  | { status: "idle"; job: null; recoveredStale?: boolean }
  | { status: "running" | "done" | "failed"; job: MuxBackfillJobPublic; recoveredStale?: boolean };

function blockedReport(setup: Awaited<ReturnType<typeof ensureMuxSetup>>): MuxBackfillReport {
  return {
    ...setup,
    directNasFetch: null,
    considered: 0,
    submitted: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    videos: [],
  };
}

export async function readMuxBackfill(): Promise<MuxBackfillStart> {
  const latest = await latestMuxBackfillJob();
  if (!latest) return { status: "idle", job: null };
  const recovered = await recoverMuxBackfillJobIfStale(latest);
  return {
    status: recovered.job.status,
    job: toPublicMuxBackfillJob(recovered.job),
    recoveredStale: recovered.recoveredStale,
  };
}

/**
 * Signing-key and webhook setup finishes before the response.
 * NAS fetch and asset creation continue in `after()` so the admin call can return.
 */
export async function startMuxBackfill(input: {
  shootId?: string;
  force?: boolean;
  reportOnly?: boolean;
}): Promise<MuxBackfillStart> {
  if (input.reportOnly) return readMuxBackfill();
  if (await nasSyncIsActive()) {
    return { status: "deferred", job: null, reason: MUX_INGEST_SYNC_REASON };
  }
  const setup = await ensureMuxSetup();
  if (muxSetupBlocksIngest(setup)) return { status: "blocked", report: blockedReport(setup) };
  const claimed = await claimMuxBackfillJob({
    shootId: input.shootId ?? null,
    force: input.force === true,
  });
  if (claimed.kind === "already_running") {
    return { status: "already_running", job: toPublicMuxBackfillJob(claimed.job) };
  }
  const jobId = claimed.job.id;
  const done = backfillMuxVideos({ shootId: input.shootId, force: input.force }).then(
    (report) => completeMuxBackfillJob(jobId, report),
    (error) => failMuxBackfillJob(jobId, error instanceof Error ? error.message : "Mux backfill failed."),
  );
  try {
    after(async () => {
      await done;
    });
  } catch (error) {
    console.error("Mux backfill continue-after-response failed", error);
  }
  return { status: "started", job: toPublicMuxBackfillJob(claimed.job) };
}
