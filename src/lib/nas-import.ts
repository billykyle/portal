import { randomUUID } from "crypto";
import { and, eq, ilike } from "drizzle-orm";
import {
  alertUndeliverableClientEmail,
  deliverableClientEmails,
  NAS_IMPORT_INVITE_NOTE,
  skippedPlaceholderDeliveryWarning,
} from "./client-contact";
import { db } from "./db";
import { clients, media, shoots } from "./db/schema";
import { listMemberUsers } from "./user-portals";
import { isPendingClientEmail } from "./signup-fields";
import { formatInviteCode, parseInviteSequence } from "./invite";
import {
  mediaFilenamesMissingFromNas,
  shouldCreatePortalShoot,
  shouldPruneShootsMissingFromNas,
} from "./demo-shoots";
import {
  armNasDiskWake,
  getNasConfig,
  listNasDirectories,
  listNasMedia,
  nasShareRoot,
  resolveNasPath,
  type NasMediaFile,
} from "./nas";
import { nasEnabled } from "./nas-flags";
import { buildDeliveryPayload, notifyDeliveryWebhook } from "./delivery";
import {
  classifyClientChildren,
  parseShootFolderName,
  pendingClientEmail,
  isClientLevelDeliverableFolder,
  type ClientFolderChild,
} from "./nas-folder";
import { createPublicToken } from "./public-link";
import { allocatePublicShareSlug, syncPublicShareSlug } from "./public-share-slug";
import { allocateShootSlug, syncShootSlug } from "./shoot-slug";

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

export type NasSyncProgress = {
  phase: "listing" | "walking" | "pruning";
  detail: string;
  clientsSeen: number;
  shootsSeen: number;
};

/** The job lock was cleared. The walk should stop without writing a second result. */
export class NasSyncStopped extends Error {
  constructor() {
    super("NAS sync stopped.");
    this.name = "NasSyncStopped";
  }
}

export function skippedNasSync(reason: string): NasSyncResult {
  return { ...EMPTY_SYNC, skipped: true, reason, warnings: [] };
}

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
      throw new Error(`No photos, floor plans, video, or raw video under ${shootFolderPath}.`);
    }
    return { imported: 0, updated: 0, removed: 0, total: 0 };
  }
  // Match by filename. Path, sort, type, url, and byte size are written from the NAS listing, not read back.
  const existing = await db
    .select({
      id: media.id,
      filename: media.filename,
    })
    .from(media)
    .where(eq(media.shootId, shootId));
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
          byteSize: file.size > 0 ? file.size : null,
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
        byteSize: file.size > 0 ? file.size : null,
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
      notes: NAS_IMPORT_INVITE_NOTE,
    })
    .returning();
  return { client, created: true };
}

async function upsertShoot(input: {
  clientId: string;
  shotDate: string;
  address: string;
  nasRelativePath: string;
  categoryFolder: string | null;
}) {
  const categoryFolder = input.categoryFolder?.trim() ? input.categoryFolder : null;
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
    const slug = existing.slug
      ? existing.slug
      : await syncShootSlug({
          shootId: existing.id,
          clientId: input.clientId,
          title: input.address,
          shotDate: input.shotDate,
          slug: null,
        });
    const publicSlug = await syncPublicShareSlug({
      shootId: existing.id,
      title: input.address,
      slug: existing.publicSlug || null,
    });
    const pathChanged = existing.nasRelativePath !== input.nasRelativePath;
    const categoryChanged = (existing.categoryFolder ?? null) !== categoryFolder;
    if (pathChanged || categoryChanged) {
      await db
        .update(shoots)
        .set({
          ...(pathChanged ? { nasRelativePath: input.nasRelativePath } : {}),
          ...(categoryChanged ? { categoryFolder } : {}),
        })
        .where(eq(shoots.id, existing.id));
    }
    return {
      shoot: { ...existing, slug, publicSlug, nasRelativePath: input.nasRelativePath, categoryFolder },
      created: false,
    };
  }
  const [shoot] = await db
    .insert(shoots)
    .values({
      clientId: input.clientId,
      publicToken: createPublicToken(),
      publicSlug: await allocatePublicShareSlug({ title: input.address }),
      shotDate: input.shotDate,
      address: input.address,
      slug: await allocateShootSlug({
        clientId: input.clientId,
        title: input.address,
        shotDate: input.shotDate,
      }),
      nasRelativePath: input.nasRelativePath,
      categoryFolder,
    })
    .returning();
  return { shoot, created: true };
}

/**
 * Walk `Client Deliverables / {client} / {date} - {address}` and one optional
 * category folder under the client. NAS is the source of truth: new drops appear,
 * files gone from the share are removed from the portal, and shoots with no
 * matching folder are pruned. Moving a folder into or out of a category updates
 * that shoot's path and category.
 */
export async function syncNasShare(options?: {
  onProgress?: (progress: NasSyncProgress) => Promise<void> | void;
  shouldContinue?: () => Promise<boolean> | boolean;
}): Promise<NasSyncResult> {
  if (!nasEnabled() || !getNasConfig()) {
    return skippedNasSync("NAS is not enabled or not configured.");
  }

  const result: NasSyncResult = { ...EMPTY_SYNC, warnings: [] };
  let clientsSeen = 0;
  let shootsSeen = 0;
  const report = async (progress: NasSyncProgress) => {
    if (!options?.onProgress) return;
    await options.onProgress(progress);
  };
  const gate = async () => {
    if (!options?.shouldContinue) return;
    if (!(await options.shouldContinue())) throw new NasSyncStopped();
  };

  await gate();
  await report({ phase: "listing", detail: "Listing client folders", clientsSeen, shootsSeen });
  armNasDiskWake();
  const root = await nasShareRoot();
  const clientFolders = await listNasDirectories(root);
  const stillsFolders = getNasConfig()?.stillsFolders ?? [];
  const skipNames = new Set(stillsFolders.map((name) => name.toLowerCase()));
  const seenShootIds = new Set<string>();

  for (const clientFolder of clientFolders) {
    await gate();
    if (skipNames.has(clientFolder.name.toLowerCase())) {
      result.warnings.push(`Skipped ${clientFolder.name} at share root (stills folder name).`);
      continue;
    }

    const { client, created: clientCreated } = await upsertClientByName(clientFolder.name);
    if (clientCreated) result.clientsCreated += 1;
    else result.clientsReused += 1;
    clientsSeen += 1;
    await report({ phase: "walking", detail: clientFolder.name, clientsSeen, shootsSeen });

    const directories = await listNasDirectories(clientFolder.path);
    const children: ClientFolderChild[] = [];
    const rootPaths = new Map<string, string>();
    const categoryPaths = new Map<string, Map<string, string>>();
    for (const directory of directories) {
      if (
        parseShootFolderName(directory.name) ||
        isClientLevelDeliverableFolder(directory.name, stillsFolders)
      ) {
        children.push({ name: directory.name });
        rootPaths.set(directory.name, directory.path);
        continue;
      }
      const inner = await listNasDirectories(directory.path);
      children.push({ name: directory.name, inner: inner.map((entry) => ({ name: entry.name })) });
      categoryPaths.set(directory.name, new Map(inner.map((entry) => [entry.name, entry.path])));
    }
    const plan = classifyClientChildren({
      clientName: clientFolder.name,
      stillsFolders,
      children,
    });
    result.warnings.push(...plan.warnings);

    for (const planned of plan.shoots) {
      const parsed = planned;
      const shootFolderPath = planned.categoryFolder
        ? categoryPaths.get(planned.categoryFolder)?.get(planned.folderName)
        : rootPaths.get(planned.folderName);
      if (!shootFolderPath) continue;

      const nasRelativePath = planned.nasRelativePath;
      const deliverables = await listNasMedia(shootFolderPath);
      shootsSeen += 1;
      await report({ phase: "walking", detail: clientFolder.name, clientsSeen, shootsSeen });
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
            `Removed empty shoot ${parsed.shotDate} — ${parsed.address} (no photos, floor plans, video, or raw video on NAS).`,
          );
        } else {
          result.warnings.push(`Skipped ${nasRelativePath} — no photos, floor plans, video, or raw video.`);
        }
        continue;
      }

      const { shoot, created: shootCreated } = await upsertShoot({
        clientId: client.id,
        shotDate: parsed.shotDate,
        address: parsed.address,
        nasRelativePath,
        categoryFolder: planned.categoryFolder,
      });
      if (shootCreated) result.shootsCreated += 1;
      else result.shootsReused += 1;
      seenShootIds.add(shoot.id);

      const existingCount = (
        await db.select({ id: media.id }).from(media).where(eq(media.shootId, shoot.id))
      ).length;
      const mediaResult = await importNasStills(shoot.id, shootFolderPath, { files: deliverables });
      result.mediaImported += mediaResult.imported;
      result.mediaUpdated += mediaResult.updated;
      result.mediaRemoved += mediaResult.removed;
      if (mediaResult.total === 0) {
        await db.delete(shoots).where(eq(shoots.id, shoot.id));
        seenShootIds.delete(shoot.id);
        result.shootsRemoved += 1;
        result.warnings.push(
          `Removed empty shoot ${parsed.shotDate} — ${parsed.address} (no photos, floor plans, video, or raw video on NAS).`,
        );
        continue;
      }
      const becameReady = shootCreated || (existingCount === 0 && mediaResult.imported > 0);
      if (!becameReady) continue;
      result.ready += 1;
      const members = await listMemberUsers(client.id);
      const recipients = deliverableClientEmails({
        preferred: client.primaryEmail,
        primaryEmail: client.primaryEmail,
        loginEmails: members.map((row) => row.email),
      });
      if (recipients.length === 0 && isPendingClientEmail(client.primaryEmail)) {
        const message = skippedPlaceholderDeliveryWarning({
          displayName: client.displayName,
          inviteCode: client.inviteCode,
          primaryEmail: client.primaryEmail,
          where: nasRelativePath,
        });
        result.warnings.push(message);
        await alertUndeliverableClientEmail(message);
        continue;
      }
      try {
        await notifyDeliveryWebhook(
          buildDeliveryPayload({
            event: "shoot.ready",
            client: { ...client, primaryEmail: recipients[0] ?? client.primaryEmail },
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

  await gate();
  await report({
    phase: "pruning",
    detail: "Removing portal shoots that are gone from the share",
    clientsSeen,
    shootsSeen,
  });

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
