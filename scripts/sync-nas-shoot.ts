import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";
import { ensureSamLeporeShoot } from "../src/lib/nas-import";
import { isNasFilePath, proxyNasThumbnail } from "../src/lib/nas";

async function main() {
  await ensureDb();
  const result = await ensureSamLeporeShoot();
  console.log(JSON.stringify(result, null, 2));
  if (!result.skipped && result.shootId) {
    const files = await sql`SELECT id, filename, nas_relative_path FROM media WHERE shoot_id = ${result.shootId} ORDER BY sort_order`;
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
