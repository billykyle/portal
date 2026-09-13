import { eq } from "drizzle-orm";
import { isPortalOnlyDemoShoot } from "../src/lib/demo-shoots";
import { db, sql } from "../src/lib/db";
import { ensureDb } from "../src/lib/db/ensure";
import { clients, media, shoots } from "../src/lib/db/schema";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  await ensureDb();
  const invite = (argValue("--invite") ?? "BK00001").trim().toUpperCase();
  const clearEmpty = !hasFlag("--keep-empty");
  const deleted: Array<{ invite: string; address: string; shotDate: string; files: number; reason: string }> =
    [];

  const [client] = await db.select().from(clients).where(eq(clients.inviteCode, invite)).limit(1);
  if (!client) {
    console.log(`No client with invite ${invite}.`);
  } else {
    const shootRows = await db.select().from(shoots).where(eq(shoots.clientId, client.id));
    for (const shoot of shootRows) {
      const files = await db.select().from(media).where(eq(media.shootId, shoot.id));
      const demo = isPortalOnlyDemoShoot({
        address: shoot.address,
        nasRelativePath: shoot.nasRelativePath,
        dropboxUrl: shoot.dropboxUrl,
        mediaUrls: files.map((file) => file.url),
      });
      if (!demo) {
        console.log(`Kept ${invite} shoot ${shoot.shotDate} — ${shoot.address} (${files.length} files).`);
        continue;
      }
      await db.delete(shoots).where(eq(shoots.id, shoot.id));
      deleted.push({
        invite,
        address: shoot.address,
        shotDate: shoot.shotDate,
        files: files.length,
        reason: "demo/placeholder",
      });
    }
  }

  if (clearEmpty) {
    const allShoots = await db.select().from(shoots);
    for (const shoot of allShoots) {
      const files = await db.select().from(media).where(eq(media.shootId, shoot.id));
      if (files.length > 0) continue;
      const [owner] = await db.select().from(clients).where(eq(clients.id, shoot.clientId)).limit(1);
      await db.delete(shoots).where(eq(shoots.id, shoot.id));
      deleted.push({
        invite: owner?.inviteCode ?? "?",
        address: shoot.address,
        shotDate: shoot.shotDate,
        files: 0,
        reason: "empty-no-files",
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        invite,
        clientKept: Boolean(client),
        clientName: client?.displayName ?? null,
        deletedShoots: deleted,
      },
      null,
      2,
    ),
  );
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
