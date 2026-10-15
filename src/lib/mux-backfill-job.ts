import type { MuxBackfillReport } from "./mux-ingest";

/** A function is limited to 5 minutes. A quiet running row after that is a crashed lock. */
export const MUX_BACKFILL_STALE_MS = 6 * 60 * 1000;

export const MUX_BACKFILL_STALE_ERROR = "Mux backfill stopped before it finished. Start it again.";

export type MuxBackfillJobStatus = "running" | "done" | "failed";

export type MuxBackfillJobPublic = {
  id: string;
  status: MuxBackfillJobStatus;
  shootId: string | null;
  force: boolean;
  allowDaytime: boolean;
  report: MuxBackfillReport | null;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export function muxSetupBlocksIngest(setup: {
  credentials: { ok: boolean };
  signing: { source: string };
  webhook: { source: string };
}) {
  return !setup.credentials.ok || setup.signing.source === "missing" || setup.webhook.source === "missing";
}

export function planMuxBackfillClaim(running: { id: string; updatedAt: Date }[], now: Date) {
  const recoverIds: string[] = [];
  let joinId: string | null = null;
  for (const row of running) {
    if (now.getTime() - row.updatedAt.getTime() >= MUX_BACKFILL_STALE_MS) recoverIds.push(row.id);
    else if (!joinId) joinId = row.id;
  }
  return { recoverIds, joinId };
}

export function isMuxBackfillStale(updatedAt: Date, now: Date) {
  return now.getTime() - updatedAt.getTime() >= MUX_BACKFILL_STALE_MS;
}
