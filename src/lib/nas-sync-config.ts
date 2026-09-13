/** Minutes between automatic syncs. `0` or `NAS_SYNC_ENABLED=false` turns it off. Default 10. */
export function nasSyncIntervalMinutes() {
  if (process.env.NAS_SYNC_ENABLED === "false") return 0;
  const raw = process.env.NAS_SYNC_INTERVAL_MINUTES;
  if (raw === undefined || raw === "") return 10;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return minutes;
}
