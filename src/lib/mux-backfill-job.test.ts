import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { muxSetupBlocksIngest, planMuxBackfillClaim } from "./mux-backfill-job";

test("mux setup blocks ingest until the signing key and webhook exist", () => {
  assert.equal(
    muxSetupBlocksIngest({
      credentials: { ok: false },
      signing: { source: "missing" },
      webhook: { source: "missing" },
    }),
    true,
  );
  assert.equal(
    muxSetupBlocksIngest({
      credentials: { ok: true },
      signing: { source: "missing" },
      webhook: { source: "created" },
    }),
    true,
  );
  assert.equal(
    muxSetupBlocksIngest({
      credentials: { ok: true },
      signing: { source: "created" },
      webhook: { source: "database" },
    }),
    false,
  );
});

test("a fresh running backfill is joined and a quiet one is recovered", () => {
  const now = new Date("2026-10-15T08:30:00Z");
  const fresh = new Date("2026-10-15T08:28:00Z");
  const stale = new Date("2026-10-15T08:20:00Z");
  const plan = planMuxBackfillClaim(
    [
      { id: "stale", updatedAt: stale },
      { id: "fresh", updatedAt: fresh },
    ],
    now,
  );
  assert.deepEqual(plan.recoverIds, ["stale"]);
  assert.equal(plan.joinId, "fresh");
  assert.deepEqual(planMuxBackfillClaim([], now), { recoverIds: [], joinId: null });
});

test("mux backfill returns setup before the NAS ingest continues", () => {
  const backfill = readFileSync(new URL("./mux-backfill.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("./mux-api.ts", import.meta.url), "utf8");
  const tools = readFileSync(new URL("./agent/tools.ts", import.meta.url), "utf8");
  assert.match(backfill, /after\(async \(\) =>/);
  assert.match(backfill, /muxSetupBlocksIngest/);
  assert.match(api, /AbortSignal\.timeout\(15_000\)/);
  assert.match(tools, /reportOnly/);
});
