import { randomUUID } from "crypto";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { clients, media, shoots, users } from "./db/schema";
import { formatInviteCode, parseInviteSequence } from "./invite";
import { guessMediaType } from "./media";
import {
  getNasConfig,
  listNasStills,
  nasEnabled,
  nasShareRoot,
  resolveNasPath,
} from "./nas";
import { createPublicToken } from "./public-link";

export const SAM_LEPORE = {
  displayName: "Sam Lepore",
  primaryEmail: "sam@example.com",
  notes: "First NAS-backed client. Stills come from Final on the UGOS share.",
  shotDate: "2026-09-04",
  address: "12 Wood View Drive",
  folder: "Sam Lepore/2026.09.04 - 12 Wood View Drive",
};

export async function importNasStills(shootId: string, shootFolderPath: string) {
  const files = await listNasStills(shootFolderPath);
  if (files.length === 0) {
    throw new Error(`No stills in Final/Photos under ${shootFolderPath}.`);
  }
  const existing = await db.select().from(media).where(eq(media.shootId, shootId));
  const byName = new Map(existing.map((row) => [row.filename, row]));
  const rows = [];
  let sortOrder = 1;
  for (const file of files) {
    const prev = byName.get(file.name);
    if (prev) {
      await db
        .update(media)
        .set({ nasRelativePath: file.path, sortOrder, type: guessMediaType(file.name) })
        .where(eq(media.id, prev.id));
    } else {
      const id = randomUUID();
      rows.push({
        id,
        shootId,
        type: guessMediaType(file.name),
        filename: file.name,
        url: `/api/media/${id}`,
        nasRelativePath: file.path,
        sortOrder,
      });
    }
    sortOrder += 1;
  }
  if (rows.length > 0) {
    await db.insert(media).values(rows);
  }
  return { imported: rows.length, updated: files.length - rows.length, total: files.length };
}

export async function resolveShootFolder(nasRelativePath: string) {
  const root = await nasShareRoot();
  return resolveNasPath(root, nasRelativePath);
}

async function nextInviteCode() {
  const existing = await db.select({ inviteCode: clients.inviteCode }).from(clients);
  const next = existing.reduce((max, row) => Math.max(max, parseInviteSequence(row.inviteCode) ?? 0), 0) + 1;
  return formatInviteCode(next);
}

export async function ensureSamLeporeShoot() {
  if (!nasEnabled() || !getNasConfig()) {
    return { skipped: true as const, reason: "NAS is not enabled or not configured." };
  }

  let [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.displayName, SAM_LEPORE.displayName))
    .limit(1);

  if (!client) {
    [client] = await db
      .insert(clients)
      .values({
        inviteCode: await nextInviteCode(),
        displayName: SAM_LEPORE.displayName,
        primaryEmail: SAM_LEPORE.primaryEmail,
        notes: SAM_LEPORE.notes,
      })
      .returning();
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, SAM_LEPORE.primaryEmail))
    .limit(1);
  if (!existingUser) {
    await db.insert(users).values({
      email: SAM_LEPORE.primaryEmail,
      passwordHash: await hash(process.env.DEMO_PASSWORD ?? "portal1234", 10),
      clientId: client.id,
    });
  }

  let [shoot] = await db
    .select()
    .from(shoots)
    .where(
      and(
        eq(shoots.clientId, client.id),
        eq(shoots.shotDate, SAM_LEPORE.shotDate),
        eq(shoots.address, SAM_LEPORE.address),
      ),
    )
    .limit(1);

  if (!shoot) {
    [shoot] = await db
      .insert(shoots)
      .values({
        clientId: client.id,
        publicToken: createPublicToken(),
        shotDate: SAM_LEPORE.shotDate,
        address: SAM_LEPORE.address,
        nasRelativePath: SAM_LEPORE.folder,
      })
      .returning();
  }

  const folder = await resolveShootFolder(shoot.nasRelativePath || SAM_LEPORE.folder);
  const result = await importNasStills(shoot.id, folder);
  return {
    skipped: false as const,
    clientId: client.id,
    inviteCode: client.inviteCode,
    shootId: shoot.id,
    publicToken: shoot.publicToken,
    ...result,
  };
}
