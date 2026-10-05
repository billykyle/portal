import { ADMIN_HOME_NAS_SYNC } from "./routes";
import { readableNasError } from "./nas-connect";
import { NasSyncStopped, syncNasShare } from "./nas-import";
import { NAS_SYNC_HEARTBEAT_MS } from "./nas-sync-job";
import {
  completeNasSyncJob,
  getNasSyncJob,
  heartbeatNasSyncJob,
  nasSyncJobIsRunning,
  recordNasSyncProgress,
} from "./nas-sync-store";

const inflight = new Map<string, Promise<void>>();

async function revalidateAfterSync() {
  try {
    const { revalidatePath } = await import("next/cache");
    const { revalidateAdminHome } = await import("./revalidate-admin-home");
    revalidatePath("/admin/clients");
    revalidateAdminHome();
    revalidateAdminHome(ADMIN_HOME_NAS_SYNC);
  } catch (error) {
    console.error("NAS sync revalidate failed", error);
  }
}

async function executeNasSyncJob(jobId: string, options?: { revalidate?: boolean }) {
  let job;
  try {
    job = await getNasSyncJob(jobId);
  } catch (error) {
    console.error("NAS sync failed to load job", error);
    await completeNasSyncJob(jobId, {
      status: "failed",
      phase: "failed",
      error: readableNasError(error),
    }).catch(() => undefined);
    return;
  }
  const source = job?.source ?? "admin";
  const started = Date.now();
  let stop = false;
  const timer = setInterval(() => {
    void heartbeatNasSyncJob(jobId)
      .then((alive) => {
        if (!alive) stop = true;
      })
      .catch((error) => {
        console.error("NAS sync heartbeat failed", error);
      });
  }, NAS_SYNC_HEARTBEAT_MS);
  if (typeof timer.unref === "function") timer.unref();

  console.log(`NAS sync start (${source})`);
  try {
    const result = await syncNasShare({
      onProgress: async (progress) => {
        if (stop) throw new NasSyncStopped();
        const saved = await recordNasSyncProgress(jobId, progress);
        if (!saved) throw new NasSyncStopped();
      },
      shouldContinue: async () => {
        if (stop) return false;
        const running = await nasSyncJobIsRunning(jobId);
        if (!running) stop = true;
        return running;
      },
    });
    if (result.skipped) {
      const saved = await completeNasSyncJob(jobId, {
        status: "failed",
        phase: "failed",
        error: result.reason ?? "NAS sync skipped.",
        summary: result,
      });
      if (saved) console.log(`NAS sync skipped (${source}): ${result.reason}`);
      return;
    }
    const saved = await completeNasSyncJob(jobId, { status: "done", phase: "done", summary: result });
    if (!saved) return;
    const ms = Date.now() - started;
    console.log(
      `NAS sync done (${source}) ${ms}ms +${result.clientsCreated} clients / +${result.shootsCreated} shoots / +${result.mediaImported} stills (reused ${result.clientsReused}c ${result.shootsReused}s, refreshed ${result.mediaUpdated}, -${result.mediaRemoved} files, -${result.shootsRemoved} orphan shoots)`,
    );
    if (options?.revalidate !== false) await revalidateAfterSync();
  } catch (error) {
    if (error instanceof NasSyncStopped || stop) {
      console.log(`NAS sync stopped (${source}): superseded`);
      return;
    }
    console.error(`NAS sync failed (${source}):`, error);
    await completeNasSyncJob(jobId, {
      status: "failed",
      phase: "failed",
      error: readableNasError(error),
    });
  } finally {
    clearInterval(timer);
  }
}

/** One in-process walk per job id. A second caller joins the same promise. */
export function launchNasSyncJob(jobId: string, options?: { revalidate?: boolean }) {
  const existing = inflight.get(jobId);
  if (existing) return existing;
  const work = executeNasSyncJob(jobId, options).finally(() => {
    inflight.delete(jobId);
  });
  inflight.set(jobId, work);
  return work;
}
