import { randomUUID } from "crypto";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "./db";
import { clients, media, shoots } from "./db/schema";
import { formatInviteCode, parseInviteSequence } from "./invite";
import {
  mediaFilenamesMissingFromNas,
  shouldCreatePortalShoot,
  shouldPruneShootsMissingFromNas,
} from "./demo-shoots";
import {
  getNasConfig,
  listNasDirectories,
  listNasMedia,
  nasShareRoot,
  resolveNasPath,
  type NasMediaFile,
} from "./nas";
import { nasEnabled } from "./nas-flags";
import { buildDeliveryPayload, notifyDeliveryWebhook } from "./delivery";
import { clientFolderRelPath, parseShootFolderName, pendingClientEmail } from "./nas-folder";
import { createPublicToken } from "./public-link";

export type NasSyncResult = {
  skipped: boolean;
  reason?: string;
  clientsCreated: number;
  clientsReused: number;
  shootsCreated: number;
  shootsReused: number;
  mediaImported: number;
  mediaUpdated: number;
  mediaRemoved: number;
  shootsRemoved: number;
  ready: number;
  warnings: string[];
};

const EMPTY_SYNC: NasSyncResult = {
  skipped: false,
  clientsCreated: 0,
  clientsReused: 0,
  shootsCreated: 0,
  shootsReused: 0,
  mediaImported: 0,
  mediaUpdated: 0,
  mediaRemoved: 0,
  shootsRemoved: 0,
  ready: 0,
  warnings: [],
};

async function nextInviteCode() {
  const existing = await db.select({ inviteCode: clients.inviteCode }).from(clients);
  const next = existing.reduce((max, row) => Math.max(max, parseInviteSequence(row.inviteCode) ?? 0), 0) + 1;
  return formatInviteCode(next);
}

export async function importNasStills(
  shootId: string,
  shootFolderPath: string,
  options: { required?: boolean; files?: NasMediaFile[] } = {},
) {
  const files = options.files ?? (await listNasMedia(shootFolderPath));
  if (files.length === 0) {
    if (options.required) {
      throw new Error(`No photos, floor plans, or video under ${shootFolderPath}.`);
    }
    return { imported: 0, updated: 0, removed: 0, total: 0 };
  }
  const existing = await db.select().from(media).where(eq(media.shootId, shootId));
  if (files.length === 0) {
    for (const prev of existing) {
      await db.delete(media).where(eq(media.id, prev.id));
    }
    return { imported: 0, updated: 0, removed: existing.length, total: 0 };
  }
  const byName = new Map(existing.map((row) => [row.filename, row]));
  const seen = new Set<string>();
  const rows = [];
  let updated = 0;
  let sortOrder = 1;
  for (const file of files) {
    seen.add(file.name);
    const prev = byName.get(file.name);
    if (prev) {
      await db
        .update(media)
        .set({
          nasRelativePath: file.path,
          sortOrder,
          type: file.type,
          url: `/api/media/${prev.id}`,
        })
        .where(eq(media.id, prev.id));
      updated += 1;
    } else {
      const id = randomUUID();
      rows.push({
        id,
        shootId,
        type: file.type,
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
  let removed = 0;
  for (const filename of mediaFilenamesMissingFromNas(existing, seen)) {
    const prev = byName.get(filename);
    if (!prev) continue;
    await db.delete(media).where(eq(media.id, prev.id));
    removed += 1;
  }
  return { imported: rows.length, updated, removed, total: files.length };
}

export async function resolveShootFolder(nasRelativePath: string) {
  const root = await nasShareRoot();
  return resolveNasPath(root, nasRelativePath);
}

async function upsertClientByName(displayName: string) {
  const [existing] = await db
    .select()
    .from(clients)
    .where(ilike(clients.displayName, displayName))
    .limit(1);
  if (existing) {
    return { client: existing, created: false };
  }
  const [client] = await db
    .insert(clients)
    .values({
      inviteCode: await nextInviteCode(),
      displayName,
      primaryEmail: pendingClientEmail(displayName),
      notes: "Imported from the NAS share. Give the client this invite code so they can sign up.",
    })
    .returning();
  return { client, created: true };
}

async function upsertShoot(input: {
  clientId: string;
  shotDate: string;
  address: string;
  nasRelativePath: string;
}) {
  const [existing] = await db
    .select()
    .from(shoots)
    .where(
      and(
        eq(shoots.clientId, input.clientId),
        eq(shoots.shotDate, input.shotDate),
        eq(shoots.address, input.address),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.nasRelativePath !== input.nasRelativePath) {
      await db.update(shoots).set({ nasRelativePath: input.nasRelativePath }).where(eq(shoots.id, existing.id));
    }
    return { shoot: { ...existing, nasRelativePath: input.nasRelativePath }, created: false };
  }
  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId: input.clientId,
      publicToken: createPublicToken(),
      shotDate: input.shotDate,
      address: input.address,
      nasRelativePath: input.nasRelativePath,
    })
    .returning();
  return { shoot, created: true };
}

/**
 * Walk `Client Deliverables / {client} / {date} - {address}` for Final|Photos
 * stills, Floor Plan folders, and video files. NAS is the source of truth:
 * new drops appear, files gone from the share are removed from the portal,
 * and shoots with no matching folder are pruned.
 */
export async function syncNasShare(): Promise<NasSyncResult> {
  if (!nasEnabled() || !getNasConfig()) {
    return { ...EMPTY_SYNC, skipped: true, reason: "NAS is not enabled or not configured." };
  }

  const result: NasSyncResult = { ...EMPTY_SYNC, warnings: [] };
  const root = await nasShareRoot();
  const clientFolders = await listNasDirectories(root);
  const skipNames = new Set(
    (getNasConfig()?.stillsFolders ?? []).map((name) => name.toLowerCase()),
  );
  const seenShootIds = new Set<string>();

  for (const clientFolder of clientFolders) {
    if (skipNames.has(clientFolder.name.toLowerCase())) {
      result.warnings.push(`Skipped ${clientFolder.name} at share root (stills folder name).`);
      continue;
    }

    const { client, created: clientCreated } = await upsertClientByName(clientFolder.name);
    if (clientCreated) result.clientsCreated += 1;
    else result.clientsReused += 1;

    const shootFolders = await listNasDirectories(clientFolder.path);
    for (const shootFolder of shootFolders) {
      const parsed = parseShootFolderName(shootFolder.name);
      if (!parsed) {
        result.warnings.push(
          `Skipped ${clientFolder.name}/${shootFolder.name} — expected "{date} - {address}".`,
        );
        continue;
      }

      const nasRelativePath = clientFolderRelPath(clientFolder.name, shootFolder.name);
      const deliverables = await listNasMedia(shootFolder.path);
      if (!shouldCreatePortalShoot(deliverables.length)) {
        const [empty] = await db
          .select()
          .from(shoots)
          .where(
            and(
              eq(shoots.clientId, client.id),
              eq(shoots.shotDate, parsed.shotDate),
              eq(shoots.address, parsed.address),
            ),
          )
          .limit(1);
        if (empty) {
          await db.delete(shoots).where(eq(shoots.id, empty.id));
          result.shootsRemoved += 1;
          result.warnings.push(
            `Removed empty shoot ${parsed.shotDate} — ${parsed.address} (no photos, floor plans, or video on NAS).`,
          );
        } else {
          result.warnings.push(`Skipped ${nasRelativePath} — no photos, floor plans, or video.`);
        }
        continue;
      }

      const { shoot, created: shootCreated } = await upsertShoot({
        clientId: client.id,
        shotDate: parsed.shotDate,
        address: parsed.address,
        nasRelativePath,
      });
      if (shootCreated) result.shootsCreated += 1;
      else result.shootsReused += 1;
      seenShootIds.add(shoot.id);

      const existingCount = (
        await db.select({ id: media.id }).from(media).where(eq(media.shootId, shoot.id))
      ).length;
      const mediaResult = await importNasStills(shoot.id, shootFolder.path, { files: deliverables });
      result.mediaImported += mediaResult.imported;
      result.mediaUpdated += mediaResult.updated;
      result.mediaRemoved += mediaResult.removed;
      if (mediaResult.total === 0) {
        await db.delete(shoots).where(eq(shoots.id, shoot.id));
        seenShootIds.delete(shoot.id);
        result.shootsRemoved += 1;
        result.warnings.push(
          `Removed empty shoot ${parsed.shotDate} — ${parsed.address} (no photos, floor plans, or video on NAS).`,
        );
        continue;
      }
      const becameReady = shootCreated || (existingCount === 0 && mediaResult.imported > 0);
      if (!becameReady) continue;
      result.ready += 1;
      try {
        await notifyDeliveryWebhook(
          buildDeliveryPayload({
            event: "shoot.ready",
            client,
            shoot,
            fileCount: mediaResult.total,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "webhook failed";
        result.warnings.push(`Delivery webhook failed for ${nasRelativePath}: ${message}`);
      }
    }
  }

  if (!shouldPruneShootsMissingFromNas(clientFolders.length)) {
    result.warnings.push("Share listed 0 client folders; skipped orphan shoot prune.");
    return result;
  }

  const portalShoots = await db.select().from(shoots);
  for (const shoot of portalShoots) {
    if (seenShootIds.has(shoot.id)) continue;
    await db.delete(shoots).where(eq(shoots.id, shoot.id));
    result.shootsRemoved += 1;
    result.warnings.push(
      `Removed portal-only shoot ${shoot.shotDate} — ${shoot.address} (not on NAS).`,
    );
  }

  return result;
}
