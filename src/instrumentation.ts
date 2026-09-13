export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDb } = await import("./lib/db/ensure");
  const { startNasSyncScheduler } = await import("./lib/nas-scheduler");
  await ensureDb();
  startNasSyncScheduler();
}
