import type { NasSyncResult } from "./nas-import";

/** A running job with no heartbeat for this long is a crashed lock. */
export const NAS_SYNC_STALE_MS = 3 * 60 * 1000;

/** How often a live walk refreshes `updatedAt` while a NAS call is in flight. */
export const NAS_SYNC_HEARTBEAT_MS = 15 * 1000;

export const NAS_SYNC_STALE_ERROR =
  "This NAS sync stopped responding, so the lock was cleared. Start a new sync.";

export const NAS_SYNC_JOB_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NasSyncSource = "admin" | "mcp" | "cli";

export type NasSyncJobStatus = "running" | "done" | "failed";

export type NasSyncSummary = NasSyncResult;

export type NasSyncJobPublic = {
  id: string;
  status: NasSyncJobStatus;
  source: NasSyncSource;
  phase: string;
  detail: string;
  clientsSeen: number;
  shootsSeen: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  summary: NasSyncSummary | null;
};

export type NasSyncStart = {
  status: "started" | "already_running";
  job: NasSyncJobPublic;
  recoveredStaleJobId: string | null;
};

export function isNasSyncJobId(value: string | null | undefined): value is string {
  return Boolean(value && NAS_SYNC_JOB_ID.test(value));
}

export function isNasSyncStale(updatedAt: Date, now: Date, staleMs = NAS_SYNC_STALE_MS) {
  return now.getTime() - updatedAt.getTime() >= staleMs;
}

/**
 * Newest running row first. A fresh row is joined. Stale rows are cleared.
 * A fresh row wins even when older rows are stale, so a live walk is not replaced.
 */
export function planNasSyncClaim(
  runningNewestFirst: Array<{ id: string; updatedAt: Date }>,
  now: Date,
  staleMs = NAS_SYNC_STALE_MS,
) {
  const recoverIds: string[] = [];
  let joinId: string | null = null;
  for (const row of runningNewestFirst) {
    if (isNasSyncStale(row.updatedAt, now, staleMs)) recoverIds.push(row.id);
    else if (joinId === null) joinId = row.id;
  }
  return { recoverIds, joinId };
}

export function parseNasSyncSummary(value: string | null | undefined): NasSyncSummary | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<NasSyncSummary>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.clientsCreated !== "number") return null;
    return {
      skipped: Boolean(parsed.skipped),
      ...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
      clientsCreated: parsed.clientsCreated,
      clientsReused: Number(parsed.clientsReused) || 0,
      shootsCreated: Number(parsed.shootsCreated) || 0,
      shootsReused: Number(parsed.shootsReused) || 0,
      mediaImported: Number(parsed.mediaImported) || 0,
      mediaUpdated: Number(parsed.mediaUpdated) || 0,
      mediaRemoved: Number(parsed.mediaRemoved) || 0,
      shootsRemoved: Number(parsed.shootsRemoved) || 0,
      ready: Number(parsed.ready) || 0,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item) => typeof item === "string") : [],
    };
  } catch {
    return null;
  }
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Same sentence the admin Sync from NAS page used after a blocking run. */
export function formatNasSyncSummary(input: NasSyncSummary) {
  const createdClients = String(input.clientsCreated);
  const shoots = String(input.shootsCreated);
  const photos = String(input.mediaImported);
  const reusedClients = String(input.clientsReused);
  const reusedShoots = String(input.shootsReused);
  const lead = `Sync finished. ${createdClients} new client${createdClients === "1" ? "" : "s"}, ${shoots} new shoot${shoots === "1" ? "" : "s"}, ${photos} new photo${photos === "1" ? "" : "s"}.`;
  const reused = `Reused ${reusedClients} client${reusedClients === "1" ? "" : "s"} / ${reusedShoots} shoot${reusedShoots === "1" ? "" : "s"}`;
  const extra: string[] = [];
  if (input.mediaUpdated) extra.push(`, refreshed ${input.mediaUpdated} stills`);
  if (input.ready) extra.push(` · ${input.ready} shoot${input.ready === 1 ? "" : "s"} ready to deliver`);
  if (input.mediaRemoved) extra.push(` · removed ${input.mediaRemoved} file${input.mediaRemoved === 1 ? "" : "s"} gone from NAS`);
  if (input.shootsRemoved) {
    extra.push(` · removed ${input.shootsRemoved} portal-only shoot${input.shootsRemoved === 1 ? "" : "s"}`);
  }
  const warningCount = input.warnings.filter((warning) => !warning.includes("no real email")).length;
  if (warningCount) extra.push(` · ${warningCount} skipped folder${warningCount === 1 ? "" : "s"}`);
  return `${lead} ${reused}${extra.join("")}.`;
}

export function nasSyncEmailNote(warnings: string[]) {
  const lines = warnings.filter((warning) => warning.includes("no real email"));
  return lines.length ? lines.join(" ") : undefined;
}

export function formatNasSyncProgress(job: Pick<NasSyncJobPublic, "detail" | "clientsSeen" | "shootsSeen">) {
  const where = job.detail ? `${job.detail} — ` : "";
  return `Syncing ${where}${plural(job.clientsSeen, "client")}, ${plural(job.shootsSeen, "shoot")}.`;
}
