import { nasEnabled } from "./nas";
import { syncNasShare, type NasSyncResult } from "./nas-import";
import { nasSyncIntervalMinutes } from "./nas-sync-config";

export { nasSyncIntervalMinutes };

type SyncSource = "boot" | "interval" | "admin" | "cli";

type GlobalNas = typeof globalThis & {
  __nasSyncInFlight?: Promise<NasSyncResult> | null;
  __nasSyncTimer?: ReturnType<typeof setInterval> | null;
};

function state() {
  return globalThis as GlobalNas;
}

export async function runLockedNasSync(source: SyncSource): Promise<NasSyncResult> {
  const g = state();
  if (g.__nasSyncInFlight) {
    console.log(`NAS sync skipped (${source}): already running`);
    return {
      skipped: true,
      reason: "A NAS sync is already running.",
      clientsCreated: 0,
      clientsReused: 0,
      shootsCreated: 0,
      shootsReused: 0,
      mediaImported: 0,
      mediaUpdated: 0,
      mediaRemoved: 0,
      ready: 0,
      warnings: [],
    };
  }

  const started = Date.now();
  console.log(`NAS sync start (${source})`);
  g.__nasSyncInFlight = syncNasShare()
    .then((result) => {
      const ms = Date.now() - started;
      if (result.skipped) {
        console.log(`NAS sync skipped (${source}): ${result.reason}`);
      } else {
        console.log(
          `NAS sync done (${source}) ${ms}ms +${result.clientsCreated} clients / +${result.shootsCreated} shoots / +${result.mediaImported} stills (reused ${result.clientsReused}c ${result.shootsReused}s, refreshed ${result.mediaUpdated})`,
        );
      }
      return result;
    })
    .catch((error) => {
      console.error(`NAS sync failed (${source}):`, error);
      throw error;
    })
    .finally(() => {
      g.__nasSyncInFlight = null;
    });

  return g.__nasSyncInFlight;
}

export function startNasSyncScheduler() {
  const g = state();
  if (g.__nasSyncTimer) return;

  const minutes = nasSyncIntervalMinutes();
  if (!nasEnabled() || minutes <= 0) {
    console.log("NAS auto-sync off");
    return;
  }

  const ms = minutes * 60 * 1000;
  console.log(`NAS auto-sync every ${minutes} min`);
  g.__nasSyncTimer = setInterval(() => {
    void runLockedNasSync("interval");
  }, ms);
  g.__nasSyncTimer.unref?.();
}
