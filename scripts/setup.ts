import { sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";

async function main() {
  await ensureDb();
  console.log("Database ready. Demo client BK00001 is seeded when the table is empty.");
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
