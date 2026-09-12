export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureDb } = await import("./lib/db/ensure");
  await ensureDb();
}
