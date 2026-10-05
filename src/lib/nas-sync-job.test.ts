import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NAS_SYNC_STALE_MS,
  formatNasSyncProgress,
  formatNasSyncSummary,
  isNasSyncStale,
  parseNasSyncSummary,
  planNasSyncClaim,
} from "./nas-sync-job";

const now = new Date("2026-10-05T15:00:00.000Z");

test("a fresh NAS sync lock is joined and a stale one is cleared", () => {
  const fresh = new Date(now.getTime() - 30_000);
  const stale = new Date(now.getTime() - NAS_SYNC_STALE_MS);
  assert.equal(isNasSyncStale(fresh, now), false);
  assert.equal(isNasSyncStale(stale, now), true);
  assert.equal(isNasSyncStale(new Date(now.getTime() - NAS_SYNC_STALE_MS + 1), now), false);

  const plan = planNasSyncClaim(
    [
      { id: "fresh", updatedAt: fresh },
      { id: "stale", updatedAt: stale },
    ],
    now,
  );
  assert.equal(plan.joinId, "fresh");
  assert.deepEqual(plan.recoverIds, ["stale"]);

  const onlyStale = planNasSyncClaim([{ id: "crashed", updatedAt: stale }], now);
  assert.equal(onlyStale.joinId, null);
  assert.deepEqual(onlyStale.recoverIds, ["crashed"]);
});

test("a finished sync summary keeps the admin sentence", () => {
  const summary = formatNasSyncSummary({
    skipped: false,
    clientsCreated: 1,
    clientsReused: 0,
    shootsCreated: 0,
    shootsReused: 0,
    mediaImported: 2,
    mediaUpdated: 0,
    mediaRemoved: 0,
    shootsRemoved: 0,
    ready: 0,
    warnings: [],
  });
  assert.equal(summary, "Sync finished. 1 new client, 0 new shoots, 2 new photos. Reused 0 clients / 0 shoots.");
  assert.equal(
    formatNasSyncProgress({ detail: "Marilyn O'Donoghue", clientsSeen: 1, shootsSeen: 6 }),
    "Syncing Marilyn O'Donoghue — 1 client, 6 shoots.",
  );
  const parsed = parseNasSyncSummary(JSON.stringify({ skipped: false, clientsCreated: 1, warnings: ["nope"] }));
  assert.equal(parsed?.clientsCreated, 1);
  assert.deepEqual(parsed?.warnings, ["nope"]);
  assert.equal(parseNasSyncSummary("not-json"), null);
});

test("admin and MCP start the same job and do not wait on the walk", () => {
  const admin = readFileSync("src/lib/admin/sync.ts", "utf8");
  const route = readFileSync("src/app/api/admin/nas-sync/route.ts", "utf8");
  const tools = readFileSync("src/lib/agent/tools.ts", "utf8");
  const scheduler = readFileSync("src/lib/nas-scheduler.ts", "utf8");
  assert.match(admin, /after\(/);
  assert.match(admin, /kickoffNasSync/);
  assert.doesNotMatch(admin, /await kicked\.done/);
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /startManualNasSync\("admin"\)/);
  assert.match(tools, /get_nas_sync_status/);
  assert.match(tools, /already_running/);
  assert.match(scheduler, /runLockedNasSync/);
  assert.doesNotMatch(scheduler, /setInterval|startNasSyncScheduler|cron/);
  const run = readFileSync("src/lib/nas-sync-run.ts", "utf8");
  assert.match(run, /heartbeatNasSyncJob/);
  assert.doesNotMatch(run, /startNasSyncScheduler|cron/);
});
