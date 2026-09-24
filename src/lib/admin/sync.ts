import { adminFail, type AdminResult } from "@/lib/admin/result";
import { ensureDb } from "@/lib/db/ensure";
import { runLockedNasSync } from "@/lib/nas-scheduler";
import type { NasSyncResult } from "@/lib/nas-import";

/** Same locked admin sync the Sync from NAS button runs. */
export async function syncNasForAdmin(): Promise<AdminResult<NasSyncResult>> {
  await ensureDb();
  try {
    const result = await runLockedNasSync("admin");
    if (result.skipped) return adminFail(result.reason ?? "NAS sync skipped.");
    return { ok: true, value: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "NAS sync failed.";
    return adminFail(message);
  }
}
