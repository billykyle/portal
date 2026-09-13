import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";

async function main() {
  await ensureDb();
  console.log("Database ready. Empty DBs get BK00001 (no fake shoots). Files come from NAS sync.");
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
