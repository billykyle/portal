import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";
import { runLockedNasSync } from "../src/lib/nas-scheduler";
import { warmMissingPreviews } from "../src/lib/warm-previews";

async function main() {
  const warm = process.argv.includes("--warm");
  await ensureDb();
  const result = await runLockedNasSync("cli");
  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) {
    if (!result.reason?.includes("already running")) {
      process.exitCode = 1;
    }
    await sql.end({ timeout: 5 });
    return;
  }
  if (warm) {
    const warmed = await warmMissingPreviews({ limit: 10000, budgetMs: 60 * 60 * 1000 });
    console.log(`Warmed ${warmed.warmed} previews (${warmed.considered} missing at start).`);
  }
  await sql.end({ timeout: 5 });
}

main().catch(async (error) => {
  console.error(error);
  try {
    await sql.end({ timeout: 1 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
