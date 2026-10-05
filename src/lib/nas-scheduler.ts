import { nasEnabled } from "./nas-flags";
import { getNasConfig } from "./nas";
import { skippedNasSync, type NasSyncResult } from "./nas-import";
import type { NasSyncSource, NasSyncStart } from "./nas-sync-job";
import { launchNasSyncJob } from "./nas-sync-run";
import { claimNasSyncJob, getNasSyncJob, toPublicNasSyncJob } from "./nas-sync-store";

export type NasSyncKickoff = NasSyncStart & { done: Promise<void> };

/**
 * One share walk at a time. Admin Sync from NAS, `sync_from_nas`, and
 * `npm run nas:sync` all claim the same job row. Callers that must return
 * before the walk finishes keep `done` alive with `after()`. The CLI awaits it.
 * Nothing here starts a walk on a timer.
 */
export async function kickoffNasSync(
  source: NasSyncSource,
  options?: { revalidate?: boolean },
): Promise<NasSyncKickoff> {
  const claimed = await claimNasSyncJob(source);
  if (claimed.kind === "already_running") {
    console.log(`NAS sync skipped (${source}): already running`);
    return {
      status: "already_running",
      job: toPublicNasSyncJob(claimed.job),
      recoveredStaleJobId: claimed.recoveredStaleJobId,
      done: Promise.resolve(),
    };
  }
  return {
    status: "started",
    job: toPublicNasSyncJob(claimed.job),
    recoveredStaleJobId: claimed.recoveredStaleJobId,
    done: launchNasSyncJob(claimed.job.id, options),
  };
}

/** CLI / scripts. Waits until the walk finishes and returns the same summary as before. */
export async function runLockedNasSync(source: NasSyncSource): Promise<NasSyncResult> {
  if (!nasEnabled() || !getNasConfig()) {
    return skippedNasSync("NAS is not enabled or not configured.");
  }
  const kicked = await kickoffNasSync(source, { revalidate: false });
  if (kicked.status === "already_running") {
    return skippedNasSync("A NAS sync is already running.");
  }
  await kicked.done;
  const job = await getNasSyncJob(kicked.job.id);
  if (job?.summary?.skipped) return job.summary;
  if (!job || job.status !== "done" || !job.summary) {
    throw new Error(job?.error || "NAS sync failed.");
  }
  return job.summary;
}
