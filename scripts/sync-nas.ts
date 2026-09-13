import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";
import { runLockedNasSync } from "../src/lib/nas-scheduler";
import { isNasFilePath, proxyNasThumbnail } from "../src/lib/nas";

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
    const files = await sql`
      SELECT filename, nas_relative_path
      FROM media
      WHERE nas_relative_path LIKE '/%'
      ORDER BY sort_order
    `;
    let warmed = 0;
    for (const file of files) {
      const path = String(file.nas_relative_path ?? "");
      if (!isNasFilePath(path)) continue;
      await proxyNasThumbnail(path, String(file.filename));
      warmed += 1;
      if (warmed % 10 === 0) console.log(`Warmed ${warmed} thumbnails…`);
    }
    console.log(`Warmed ${warmed} thumbnails.`);
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
