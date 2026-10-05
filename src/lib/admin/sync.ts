import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { adminFail, type AdminResult } from "@/lib/admin/result";
import { ensureDb } from "@/lib/db/ensure";
import { readableNasError } from "@/lib/nas-connect";
import { nasEnabled } from "@/lib/nas-flags";
import { getNasConfig } from "@/lib/nas";
import type { NasSyncStart } from "@/lib/nas-sync-job";
import { isNasSyncJobId } from "@/lib/nas-sync-job";
import { kickoffNasSync } from "@/lib/nas-scheduler";
import { getNasSyncJob, latestNasSyncJob, recoverNasSyncJobIfStale, toPublicNasSyncJob } from "@/lib/nas-sync-store";

export type NasSyncStatusRead = {
  job: NasSyncStart["job"] | null;
  recoveredStale: boolean;
};

function nasNotConfigured() {
  return adminFail(readableNasError("NAS is not enabled or not configured."));
}

/**
 * Starts the shared manual sync and returns as soon as the job row exists.
 * `after` keeps the walk alive on the admin and MCP routes after the response.
 */
export async function startManualNasSync(source: "admin" | "mcp"): Promise<AdminResult<NasSyncStart>> {
  await ensureDb();
  try {
    if (!nasEnabled() || !getNasConfig()) return nasNotConfigured();
    const kicked = await kickoffNasSync(source);
    if (kicked.status === "started") {
      const done = kicked.done;
      try {
        after(async () => {
          await done;
        });
      } catch (error) {
        console.error("NAS sync continue-after-response failed", error);
      }
    }
    return {
      ok: true,
      value: {
        status: kicked.status,
        job: kicked.job,
        recoveredStaleJobId: kicked.recoveredStaleJobId,
      },
    };
  } catch (error) {
    unstable_rethrow(error);
    const raw = error instanceof Error ? error.message : "NAS sync failed.";
    const message = readableNasError(error);
    if (message !== raw) console.error("NAS sync unreachable:", raw);
    return adminFail(message);
  }
}

export async function readManualNasSync(jobId?: string): Promise<AdminResult<NasSyncStatusRead>> {
  await ensureDb();
  try {
    if (jobId && !isNasSyncJobId(jobId)) return adminFail("NAS sync job was not found.");
    const row = jobId ? await getNasSyncJob(jobId) : await latestNasSyncJob();
    if (!row) {
      if (jobId) return adminFail("NAS sync job was not found.");
      return { ok: true, value: { job: null, recoveredStale: false } };
    }
    const recovered = await recoverNasSyncJobIfStale(row);
    return {
      ok: true,
      value: { job: toPublicNasSyncJob(recovered.job), recoveredStale: recovered.recoveredStale },
    };
  } catch (error) {
    unstable_rethrow(error);
    return adminFail(readableNasError(error));
  }
}
