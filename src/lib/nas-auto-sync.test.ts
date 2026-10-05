import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("nothing starts a NAS sync on its own", () => {
  const vercel = readFileSync("vercel.json", "utf8");
  assert.doesNotMatch(vercel, /nas-sync/);
  assert.match(vercel, /shoot-reminders/);
  assert.equal(existsSync("src/app/api/cron/nas-sync/route.ts"), false);
  assert.equal(existsSync("src/lib/nas-sync-config.ts"), false);

  const scheduler = readFileSync("src/lib/nas-scheduler.ts", "utf8");
  assert.doesNotMatch(scheduler, /setInterval|startNasSyncScheduler|cron|boot/);
  assert.match(scheduler, /runLockedNasSync/);

  const ensure = readFileSync("src/lib/db/ensure.ts", "utf8");
  assert.doesNotMatch(ensure, /runLockedNasSync|startNasSyncScheduler|nas-scheduler/);

  const instrumentation = readFileSync("src/instrumentation.ts", "utf8");
  assert.doesNotMatch(instrumentation, /nas-scheduler|startNasSyncScheduler|runLockedNasSync/);

  const home = readFileSync("src/app/admin/home/page.tsx", "utf8");
  assert.doesNotMatch(home, /SyncNasForm|runLockedNasSync/);
  const nas = readFileSync("src/app/admin/home/nas-sync/page.tsx", "utf8");
  assert.match(nas, /SyncNasForm/);
  const form = readFileSync("src/components/forms/sync-nas-form.tsx", "utf8");
  assert.match(form, /Sync from NAS/);
  const agent = readFileSync("src/lib/agent/tools.ts", "utf8");
  assert.match(agent, /sync_from_nas/);
  assert.match(agent, /get_nas_sync_status/);

  for (const path of ["README.md", "docs/agent.md", "docs/vercel.md"]) {
    const doc = readFileSync(path, "utf8");
    assert.match(doc, /manual/i);
    assert.doesNotMatch(doc, /every 10 minutes/);
  }
});
