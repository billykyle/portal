import assert from "node:assert/strict";
import { test } from "node:test";
import { nasSyncIntervalMinutes } from "./nas-sync-config";

test("auto-sync defaults to 10 minutes", () => {
  delete process.env.NAS_SYNC_ENABLED;
  delete process.env.NAS_SYNC_INTERVAL_MINUTES;
  assert.equal(nasSyncIntervalMinutes(), 10);
});

test("auto-sync can be turned off", () => {
  process.env.NAS_SYNC_INTERVAL_MINUTES = "0";
  assert.equal(nasSyncIntervalMinutes(), 0);
  process.env.NAS_SYNC_INTERVAL_MINUTES = "15";
  process.env.NAS_SYNC_ENABLED = "false";
  assert.equal(nasSyncIntervalMinutes(), 0);
});
