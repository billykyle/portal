import { desc, eq, inArray } from "drizzle-orm";
import { adminFail, type AdminResult } from "@/lib/admin/result";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots } from "@/lib/db/schema";
import { createPublicToken } from "@/lib/public-link";

const shootColumns = {
  id: shoots.id,
  clientId: shoots.clientId,
  publicToken: shoots.publicToken,
  shotDate: shoots.shotDate,
  address: shoots.address,
  nasRelativePath: shoots.nasRelativePath,
  dropboxUrl: shoots.dropboxUrl,
  createdAt: shoots.createdAt,
};

export type ShootRecord = {
  id: string;
  clientId: string;
  publicToken: string;
  shotDate: string;
  address: string;
  nasRelativePath: string | null;
  dropboxUrl: string | null;
  createdAt: Date;
  inviteCode: string;
  clientName: string;
};

async function withClient(row: {
  id: string;
  clientId: string;
  publicToken: string;
  shotDate: string;
  address: string;
  nasRelativePath: string | null;
  dropboxUrl: string | null;
  createdAt: Date;
}): Promise<ShootRecord | null> {
  const [client] = await db
    .select({ inviteCode: clients.inviteCode, displayName: clients.displayName })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);
  if (!client) return null;
  return { ...row, inviteCode: client.inviteCode, clientName: client.displayName };
}

export async function listShootRecordsForClient(clientId: string): Promise<AdminResult<ShootRecord[]>> {
  await ensureDb();
  if (!isUuid(clientId)) return adminFail("Client was not found.");
  const [client] = await db
    .select({ id: clients.id, inviteCode: clients.inviteCode, displayName: clients.displayName })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return adminFail("Client was not found.");
  const rows = await db
    .select(shootColumns)
    .from(shoots)
    .where(eq(shoots.clientId, clientId))
    .orderBy(desc(shoots.shotDate));
  return {
    ok: true,
    value: rows.map((row) => ({
      ...row,
      inviteCode: client.inviteCode,
      clientName: client.displayName,
    })),
  };
}

export async function getShootRecord(shootId: string): Promise<AdminResult<ShootRecord>> {
  await ensureDb();
  if (!isUuid(shootId)) return adminFail("Shoot was not found.");
  const [row] = await db.select(shootColumns).from(shoots).where(eq(shoots.id, shootId)).limit(1);
  if (!row) return adminFail("Shoot was not found.");
  const shoot = await withClient(row);
  if (!shoot) return adminFail("Shoot was not found.");
  return { ok: true, value: shoot };
}

export async function listMediaForClientShoots(shootIds: string[]) {
  await ensureDb();
  if (shootIds.length === 0) return [];
  return db
    .select({
      shootId: media.shootId,
      id: media.id,
      type: media.type,
      filename: media.filename,
      sortOrder: media.sortOrder,
    })
    .from(media)
    .where(inArray(media.shootId, shootIds));
}

export async function listShootMedia(shootId: string) {
  await ensureDb();
  return db
    .select({
      id: media.id,
      type: media.type,
      filename: media.filename,
      sortOrder: media.sortOrder,
    })
    .from(media)
    .where(eq(media.shootId, shootId));
}

/** Return the stable public token, minting one only when the row has none. Does not rotate. */
export async function ensureShootPublicToken(shootId: string): Promise<AdminResult<{ token: string; minted: boolean }>> {
  const found = await getShootRecord(shootId);
  if (!found.ok) return found;
  if (found.value.publicToken) {
    return { ok: true, value: { token: found.value.publicToken, minted: false } };
  }
  const token = createPublicToken();
  await db.update(shoots).set({ publicToken: token }).where(eq(shoots.id, shootId));
  return { ok: true, value: { token, minted: true } };
}
