import { and, asc, eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientPublicSlugAliases, clients, shootPublicSlugAliases, shootShareAliases, shoots } from "@/lib/db/schema";
import { publicShootPath } from "@/lib/public-link";
import { isReservedClientSlug, RESERVED_CLIENT_SLUGS } from "@/lib/reserved-routes";

/** Serializes slug allocation so two rows cannot claim the same name. */
const PUBLIC_SLUG_LOCK = 4815162342;

/**
 * Display name → URL segment.
 * Spaces become "-", anything except letters, digits, and "-" is removed,
 * and repeated dashes collapse. Capitalization is kept.
 */
export function slugifyPublicShare(title: string, fallback = "shoot") {
  const slug = title
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{Nd}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** First free slug. The set is compared case-insensitively. Collisions are -2, -3, ... */
export function choosePublicShareSlug(title: string, taken: ReadonlySet<string>, fallback = "shoot") {
  const folded = new Set([...taken].map((slug) => slug.toLowerCase()));
  const base = slugifyPublicShare(title, fallback);
  if (!folded.has(base.toLowerCase())) return base;
  let n = 2;
  while (folded.has(`${base}-${n}`.toLowerCase())) n += 1;
  return `${base}-${n}`;
}

/** True when this slug was issued for this title, including a -2/-3 collision suffix. */
export function publicSlugMatchesTitle(slug: string, title: string, fallback = "shoot") {
  const base = slugifyPublicShare(title, fallback);
  if (slug === base) return true;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}-\\d+$`).test(slug);
}

/** Person or team name shown in admin. A client with no name uses the company. */
export function clientShareLabel(input: { displayName?: string | null; company?: string | null }) {
  const name = input.displayName?.trim() ?? "";
  if (name) return name;
  return input.company?.trim() ?? "";
}

function clientSlugSource(input: { displayName?: string | null; company?: string | null }) {
  return clientShareLabel(input).trim() || "client";
}

/** Reserved route names are already taken, case-insensitively. */
export function chooseClientSlug(label: string, taken: ReadonlySet<string>) {
  const blocked = new Set<string>([...taken].map((slug) => slug.toLowerCase()));
  for (const slug of RESERVED_CLIENT_SLUGS) blocked.add(slug.toLowerCase());
  return choosePublicShareSlug(label.trim() || "client", blocked, "client");
}

export function clientSlugMatches(slug: string, label: string) {
  if (isReservedClientSlug(slug)) return false;
  return publicSlugMatchesTitle(slug, label.trim() || "client", "client");
}

/** Clients who receive -2 because another client slugifies to the same name. Reserved routes are not counted. */
export function countClientNameCollisions(
  rows: readonly { displayName?: string | null; company?: string | null }[],
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const base = slugifyPublicShare(clientSlugSource(row), "client").toLowerCase();
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  let suffixed = 0;
  for (const count of counts.values()) {
    if (count > 1) suffixed += count - 1;
  }
  return suffixed;
}

export type ClientSlugPlanRow = {
  id: string;
  slug: string;
  previous: string | null;
  assigned: boolean;
  /** Another client already owns this name. A reserved-route suffix is not a name collision. */
  nameCollision: boolean;
};

export function planClientShareSlugs(
  rows: readonly { id: string; displayName: string; company: string | null; publicSlug: string | null }[],
  aliasSlugs: readonly string[] = [],
): ClientSlugPlanRow[] {
  const taken = new Set(aliasSlugs.map((slug) => slug.toLowerCase()));
  const bases = new Map<string, number>();
  for (const row of rows) {
    const base = slugifyPublicShare(clientSlugSource(row), "client").toLowerCase();
    bases.set(base, (bases.get(base) ?? 0) + 1);
  }
  const plan: ClientSlugPlanRow[] = [];
  for (const row of rows) {
    const label = clientSlugSource(row);
    const base = slugifyPublicShare(label, "client");
    const nameCollisionBase = (bases.get(base.toLowerCase()) ?? 0) > 1;
    if (row.publicSlug && clientSlugMatches(row.publicSlug, label)) {
      taken.add(row.publicSlug.toLowerCase());
      plan.push({
        id: row.id,
        slug: row.publicSlug,
        previous: row.publicSlug,
        assigned: false,
        nameCollision: nameCollisionBase && row.publicSlug.toLowerCase() !== base.toLowerCase(),
      });
      continue;
    }
    const slug = chooseClientSlug(label, taken);
    taken.add(slug.toLowerCase());
    plan.push({
      id: row.id,
      slug,
      previous: row.publicSlug,
      assigned: true,
      nameCollision: nameCollisionBase && slug.toLowerCase() !== base.toLowerCase(),
    });
  }
  return plan;
}

export type WithinClientShootPlanRow = {
  id: string;
  clientId: string;
  address: string;
  slug: string;
  previous: string | null;
  changed: boolean;
  /** -2 because another shoot of this same client already uses the name. */
  collision: boolean;
};

/**
 * Shoot slugs are unique inside one client.
 * A -2 that exists only because PR #133 required a global /s/<name> is dropped.
 * A -2 that separates two shoots of the same client stays.
 * Rows must already be ordered by createdAt, then id.
 */
export function planWithinClientShootSlugs(
  rows: readonly { id: string; clientId: string; address: string; publicSlug: string | null }[],
  aliases: readonly { clientId: string; slug: string; shootId: string }[] = [],
): WithinClientShootPlanRow[] {
  const byClient = new Map<string, typeof rows[number][]>();
  for (const row of rows) {
    const list = byClient.get(row.clientId) ?? [];
    list.push(row);
    byClient.set(row.clientId, list);
  }
  const plan: WithinClientShootPlanRow[] = [];
  for (const [clientId, clientRows] of byClient) {
    const taken = new Set(
      aliases.filter((alias) => alias.clientId === clientId).map((alias) => alias.slug.toLowerCase()),
    );
    for (const row of clientRows) {
      const base = slugifyPublicShare(row.address);
      const current = row.publicSlug;
      const matches = current ? publicSlugMatchesTitle(current, row.address) : false;
      const baseTaken = taken.has(base.toLowerCase());
      let slug = current ?? "";
      let changed = false;
      if (!current || (matches && current.toLowerCase() !== base.toLowerCase() && !baseTaken)) {
        slug = choosePublicShareSlug(row.address, taken);
        changed = slug !== current;
      }
      taken.add(slug.toLowerCase());
      if (changed && current) taken.add(current.toLowerCase());
      plan.push({
        id: row.id,
        clientId,
        address: row.address,
        slug,
        previous: current,
        changed,
        collision: slug.toLowerCase() !== base.toLowerCase(),
      });
    }
  }
  return plan;
}

/** Snapshot PR #133 /s/<slug> keys before shoot slugs are recomputed per client. */
export function planLegacyGlobalSlugs(
  rows: readonly { id: string; address: string; publicSlug: string | null }[],
  existing: readonly { slug: string; shootId: string }[],
): { slug: string; shootId: string }[] {
  const taken = new Set(existing.map((alias) => alias.slug.toLowerCase()));
  const extra: { slug: string; shootId: string }[] = [];
  for (const row of rows) {
    if (!row.publicSlug) continue;
    const key = row.publicSlug.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    extra.push({ slug: row.publicSlug, shootId: row.id });
  }
  for (const row of rows) {
    if (row.publicSlug) continue;
    const slug = choosePublicShareSlug(row.address, taken);
    taken.add(slug.toLowerCase());
    extra.push({ slug, shootId: row.id });
  }
  return extra;
}

export type PublicShareVia = "slug" | "alias" | "token";

export type ShareClient = { id: string; publicSlug: string };
export type ShareShoot = { id: string; clientId: string; publicSlug: string; publicToken: string };

export function matchClientShare(
  key: string,
  rows: readonly ShareClient[],
  aliases: readonly { slug: string; clientId: string }[],
): { client: ShareClient; via: "slug" | "alias" } | null {
  const folded = key.toLowerCase();
  const current = rows.find((row) => row.publicSlug.toLowerCase() === folded);
  if (current) return { client: current, via: "slug" };
  const alias = aliases.find((row) => row.slug.toLowerCase() === folded);
  if (!alias) return null;
  const client = rows.find((row) => row.id === alias.clientId);
  if (!client) return null;
  return { client, via: "alias" };
}

export function matchShootShare(
  clientId: string,
  key: string,
  rows: readonly ShareShoot[],
  aliases: readonly { clientId: string; slug: string; shootId: string }[],
): { shoot: ShareShoot; via: "slug" | "alias" } | null {
  const folded = key.toLowerCase();
  const current = rows.find((row) => row.clientId === clientId && row.publicSlug.toLowerCase() === folded);
  if (current) return { shoot: current, via: "slug" };
  const alias = aliases.find((row) => row.clientId === clientId && row.slug.toLowerCase() === folded);
  if (!alias) return null;
  const shoot = rows.find((row) => row.id === alias.shootId && row.clientId === clientId);
  if (!shoot) return null;
  return { shoot, via: "alias" };
}

/** Exact canonical segments serve the page. Any other spelling permanently redirects. */
export function canonicalShareRedirect(input: {
  clientKey: string;
  shootKey: string;
  clientSlug: string;
  shootSlug: string;
}): { pathname: string; status: 308 } | null {
  if (input.clientKey === input.clientSlug && input.shootKey === input.shootSlug) return null;
  return { pathname: publicShootPath(input.clientSlug, input.shootSlug), status: 308 };
}

/**
 * /s/<key> → the shoot that key was issued for.
 * Legacy global slugs (including PR #133 -2) win over a current slug that another client reused.
 * A random token is next. A current slug is used only when exactly one shoot has it.
 */
export function matchLegacyPublicShare(
  key: string,
  shoots: readonly ShareShoot[],
  clients: readonly ShareClient[],
  legacyAliases: readonly { slug: string; shootId: string }[],
): { shoot: ShareShoot; via: PublicShareVia; pathname: string } | null {
  const folded = key.toLowerCase();
  const clientSlug = (clientId: string) => clients.find((row) => row.id === clientId)?.publicSlug ?? "";
  const pathFor = (shoot: ShareShoot) => {
    const owner = clientSlug(shoot.clientId);
    if (!owner) return "";
    return publicShootPath(owner, shoot.publicSlug);
  };

  const alias = legacyAliases.find((row) => row.slug.toLowerCase() === folded);
  if (alias) {
    const shoot = shoots.find((row) => row.id === alias.shootId);
    const pathname = shoot ? pathFor(shoot) : "";
    if (shoot && pathname) return { shoot, via: "alias", pathname };
  }

  const byToken = shoots.find((row) => row.publicToken === key);
  if (byToken) {
    const pathname = pathFor(byToken);
    if (pathname) return { shoot: byToken, via: "token", pathname };
  }

  const current = shoots.filter((row) => row.publicSlug.toLowerCase() === folded);
  if (current.length === 1) {
    const shoot = current[0]!;
    const pathname = pathFor(shoot);
    if (pathname) return { shoot, via: "slug", pathname };
  }
  return null;
}

export function decodePublicShareKey(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type ClientSlugBackfillReport = {
  assigned: { clientId: string; slug: string; nameCollision: boolean }[];
  nameCollisions: number;
};

export function formatClientSlugBackfill(report: ClientSlugBackfillReport) {
  const count = `Backfilled ${report.assigned.length} client slug${report.assigned.length === 1 ? "" : "s"}.`;
  return `${count} Client-name collisions: ${report.nameCollisions}.`;
}

export type PublicSlugBackfillReport = {
  assigned: { shootId: string; address: string; slug: string; collision: boolean }[];
  recomputed: { shootId: string; address: string; from: string; slug: string }[];
  alreadySet: number;
};

export function formatPublicSlugBackfill(report: PublicSlugBackfillReport) {
  const fresh = `Assigned ${report.assigned.length} public shoot slug${report.assigned.length === 1 ? "" : "s"}.`;
  const moved = `Recomputed ${report.recomputed.length} cross-client suffix${report.recomputed.length === 1 ? "" : "es"}.`;
  if (report.recomputed.length === 0) return `${fresh} ${moved}`;
  const list = report.recomputed.map((row) => `${row.address} -> ${row.slug} (was ${row.from})`).join("; ");
  return `${fresh} ${moved} ${list}`;
}

type Query = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

async function withSlugLock<T>(fn: (tx: Query) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`select pg_advisory_xact_lock(${PUBLIC_SLUG_LOCK})`);
    return fn(tx);
  });
}

async function takenClientSlugs(database: Query, exceptClientId?: string) {
  const [current, aliases] = await Promise.all([
    database.select({ id: clients.id, slug: clients.publicSlug }).from(clients),
    database
      .select({ clientId: clientPublicSlugAliases.clientId, slug: clientPublicSlugAliases.slug })
      .from(clientPublicSlugAliases),
  ]);
  const taken = new Set<string>();
  for (const row of current) {
    if (!row.slug || row.id === exceptClientId) continue;
    taken.add(row.slug.toLowerCase());
  }
  for (const row of aliases) {
    if (row.clientId === exceptClientId) continue;
    taken.add(row.slug.toLowerCase());
  }
  return taken;
}

async function takenClientShootSlugs(database: Query, clientId: string, exceptShootId?: string) {
  const [current, aliases] = await Promise.all([
    database
      .select({ id: shoots.id, slug: shoots.publicSlug })
      .from(shoots)
      .where(eq(shoots.clientId, clientId)),
    database
      .select({ shootId: shootShareAliases.shootId, slug: shootShareAliases.slug })
      .from(shootShareAliases)
      .where(eq(shootShareAliases.clientId, clientId)),
  ]);
  const taken = new Set<string>();
  for (const row of current) {
    if (!row.slug || row.id === exceptShootId) continue;
    taken.add(row.slug.toLowerCase());
  }
  for (const row of aliases) {
    if (row.shootId === exceptShootId) continue;
    taken.add(row.slug.toLowerCase());
  }
  return taken;
}

async function rememberClientAlias(database: Query, slug: string, clientId: string) {
  const [owner] = await database
    .select({ clientId: clientPublicSlugAliases.clientId })
    .from(clientPublicSlugAliases)
    .where(drizzleSql`lower(${clientPublicSlugAliases.slug}) = ${slug.toLowerCase()}`)
    .limit(1);
  if (owner) return;
  await database.insert(clientPublicSlugAliases).values({ slug, clientId }).onConflictDoNothing();
}

async function rememberClientShootAlias(database: Query, clientId: string, slug: string, shootId: string) {
  const [owner] = await database
    .select({ shootId: shootShareAliases.shootId })
    .from(shootShareAliases)
    .where(
      and(
        eq(shootShareAliases.clientId, clientId),
        drizzleSql`lower(${shootShareAliases.slug}) = ${slug.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (owner) return;
  await database.insert(shootShareAliases).values({ clientId, slug, shootId }).onConflictDoNothing();
}

async function rememberLegacySlug(database: Query, slug: string, shootId: string) {
  const [owner] = await database
    .select({ shootId: shootPublicSlugAliases.shootId })
    .from(shootPublicSlugAliases)
    .where(drizzleSql`lower(${shootPublicSlugAliases.slug}) = ${slug.toLowerCase()}`)
    .limit(1);
  if (owner) return;
  await database.insert(shootPublicSlugAliases).values({ slug, shootId }).onConflictDoNothing();
}

export async function allocateClientShareSlug(input: {
  displayName?: string | null;
  company?: string | null;
  exceptClientId?: string;
}) {
  return withSlugLock(async (tx) => {
    const taken = await takenClientSlugs(tx, input.exceptClientId);
    return chooseClientSlug(clientShareLabel(input), taken);
  });
}

/** Keep the client slug unless the display name (or company fallback) changed. The old slug keeps redirecting. */
export async function syncClientShareSlug(input: {
  clientId: string;
  displayName?: string | null;
  company?: string | null;
  slug: string | null;
}) {
  const label = clientShareLabel(input);
  if (input.slug && clientSlugMatches(input.slug, label)) return input.slug;
  return withSlugLock(async (tx) => {
    const taken = await takenClientSlugs(tx, input.clientId);
    const next = chooseClientSlug(label, taken);
    if (next === input.slug) return next;
    if (input.slug) await rememberClientAlias(tx, input.slug, input.clientId);
    await tx
      .delete(clientPublicSlugAliases)
      .where(
        drizzleSql`lower(${clientPublicSlugAliases.slug}) = ${next.toLowerCase()} and ${clientPublicSlugAliases.clientId} = ${input.clientId}`,
      );
    await tx.update(clients).set({ publicSlug: next }).where(eq(clients.id, input.clientId));
    return next;
  });
}

export async function allocatePublicShareSlug(input: {
  clientId: string;
  title: string;
  exceptShootId?: string;
}) {
  return withSlugLock(async (tx) => {
    const taken = await takenClientShootSlugs(tx, input.clientId, input.exceptShootId);
    return choosePublicShareSlug(input.title, taken);
  });
}

/** Keep the issued slug unless the shoot name's slug changed. Previous slugs keep redirecting. */
export async function syncPublicShareSlug(input: {
  shootId: string;
  clientId: string;
  title: string;
  slug: string | null;
}) {
  if (input.slug && publicSlugMatchesTitle(input.slug, input.title)) return input.slug;
  return withSlugLock(async (tx) => {
    const taken = await takenClientShootSlugs(tx, input.clientId, input.shootId);
    const next = choosePublicShareSlug(input.title, taken);
    if (next === input.slug) return next;
    if (input.slug) {
      await rememberClientShootAlias(tx, input.clientId, input.slug, input.shootId);
      await rememberLegacySlug(tx, input.slug, input.shootId);
    }
    await tx
      .delete(shootShareAliases)
      .where(
        and(
          eq(shootShareAliases.clientId, input.clientId),
          eq(shootShareAliases.shootId, input.shootId),
          drizzleSql`lower(${shootShareAliases.slug}) = ${next.toLowerCase()}`,
        ),
      );
    await tx.update(shoots).set({ publicSlug: next }).where(eq(shoots.id, input.shootId));
    return next;
  });
}

async function clientByShareKey(key: string) {
  const folded = key.toLowerCase();
  const [current] = await db
    .select()
    .from(clients)
    .where(drizzleSql`lower(${clients.publicSlug}) = ${folded}`)
    .limit(1);
  if (current?.publicSlug) return { client: current, via: "slug" as const };
  const [alias] = await db
    .select({ clientId: clientPublicSlugAliases.clientId })
    .from(clientPublicSlugAliases)
    .where(drizzleSql`lower(${clientPublicSlugAliases.slug}) = ${folded}`)
    .limit(1);
  if (!alias) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, alias.clientId)).limit(1);
  if (!client?.publicSlug) return null;
  return { client, via: "alias" as const };
}

async function shootByShareKey(clientId: string, key: string) {
  const folded = key.toLowerCase();
  const [current] = await db
    .select()
    .from(shoots)
    .where(and(eq(shoots.clientId, clientId), drizzleSql`lower(${shoots.publicSlug}) = ${folded}`))
    .limit(1);
  if (current?.publicSlug) return { shoot: current, via: "slug" as const };
  const [alias] = await db
    .select({ shootId: shootShareAliases.shootId })
    .from(shootShareAliases)
    .where(
      and(eq(shootShareAliases.clientId, clientId), drizzleSql`lower(${shootShareAliases.slug}) = ${folded}`),
    )
    .limit(1);
  if (!alias) return null;
  const [shoot] = await db
    .select()
    .from(shoots)
    .where(and(eq(shoots.id, alias.shootId), eq(shoots.clientId, clientId)))
    .limit(1);
  if (!shoot?.publicSlug) return null;
  return { shoot, via: "alias" as const };
}

export async function resolvePublicShootPath(rawClient: string, rawShoot: string) {
  const clientKey = decodePublicShareKey(rawClient).trim();
  const shootKey = decodePublicShareKey(rawShoot).trim();
  if (!clientKey || !shootKey) return null;
  const owner = await clientByShareKey(clientKey);
  if (!owner?.client.publicSlug) return null;
  const found = await shootByShareKey(owner.client.id, shootKey);
  if (!found?.shoot.publicSlug) return null;
  const redirect = canonicalShareRedirect({
    clientKey,
    shootKey,
    clientSlug: owner.client.publicSlug,
    shootSlug: found.shoot.publicSlug,
  });
  return {
    shoot: found.shoot,
    client: owner.client,
    via: found.via === "slug" && owner.via === "slug" ? ("slug" as const) : ("alias" as const),
    redirectTo: redirect?.pathname ?? null,
  };
}

/** Old /s/<token> and /s/<Shoot-Name> keys. Always points at the new /<client>/<shoot> path. */
export async function resolvePublicShare(rawKey: string) {
  const key = decodePublicShareKey(rawKey).trim();
  if (!key) return null;
  const folded = key.toLowerCase();
  const [alias] = await db
    .select({ shootId: shootPublicSlugAliases.shootId })
    .from(shootPublicSlugAliases)
    .where(drizzleSql`lower(${shootPublicSlugAliases.slug}) = ${folded}`)
    .limit(1);
  const shoot = alias
    ? (
        await db.select().from(shoots).where(eq(shoots.id, alias.shootId)).limit(1)
      )[0]
    : null;
  const viaAlias = shoot?.publicSlug ? { shoot, via: "alias" as const } : null;
  const [byToken] = viaAlias
    ? [undefined]
    : await db.select().from(shoots).where(eq(shoots.publicToken, key)).limit(1);
  let found: { shoot: NonNullable<typeof shoot>; via: PublicShareVia } | null =
    viaAlias ?? (byToken?.publicSlug ? { shoot: byToken, via: "token" as const } : null);
  if (!found) {
    const current = await db
      .select()
      .from(shoots)
      .where(drizzleSql`lower(${shoots.publicSlug}) = ${folded}`)
      .limit(2);
    if (current.length === 1 && current[0]?.publicSlug) found = { shoot: current[0], via: "slug" };
  }
  if (!found?.shoot.publicSlug) return null;
  const [owner] = await db
    .select({ publicSlug: clients.publicSlug })
    .from(clients)
    .where(eq(clients.id, found.shoot.clientId))
    .limit(1);
  if (!owner?.publicSlug) return null;
  return {
    shoot: found.shoot,
    via: found.via,
    redirectTo: publicShootPath(owner.publicSlug, found.shoot.publicSlug),
  };
}

export async function backfillClientShareSlugs(): Promise<ClientSlugBackfillReport> {
  return withSlugLock(async (tx) => {
    const rows = await tx
      .select({
        id: clients.id,
        displayName: clients.displayName,
        company: clients.company,
        publicSlug: clients.publicSlug,
      })
      .from(clients)
      .orderBy(asc(clients.createdAt), asc(clients.id));
    const aliases = await tx
      .select({ slug: clientPublicSlugAliases.slug })
      .from(clientPublicSlugAliases);
    const plan = planClientShareSlugs(
      rows.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        company: row.company,
        publicSlug: row.publicSlug,
      })),
      aliases.map((row) => row.slug),
    );
    const assigned: ClientSlugBackfillReport["assigned"] = [];
    for (const row of plan) {
      if (!row.assigned) continue;
      if (row.previous && row.previous !== row.slug) await rememberClientAlias(tx, row.previous, row.id);
      await tx
        .delete(clientPublicSlugAliases)
        .where(
          drizzleSql`lower(${clientPublicSlugAliases.slug}) = ${row.slug.toLowerCase()} and ${clientPublicSlugAliases.clientId} = ${row.id}`,
        );
      await tx.update(clients).set({ publicSlug: row.slug }).where(eq(clients.id, row.id));
      assigned.push({ clientId: row.id, slug: row.slug, nameCollision: row.nameCollision });
    }
    return { assigned, nameCollisions: countClientNameCollisions(rows) };
  });
}

export async function backfillPublicShareSlugs(): Promise<PublicSlugBackfillReport> {
  return withSlugLock(async (tx) => {
    const rows = await tx
      .select({
        id: shoots.id,
        clientId: shoots.clientId,
        address: shoots.address,
        publicSlug: shoots.publicSlug,
      })
      .from(shoots)
      .orderBy(asc(shoots.createdAt), asc(shoots.id));
    const legacy = await tx
      .select({ slug: shootPublicSlugAliases.slug, shootId: shootPublicSlugAliases.shootId })
      .from(shootPublicSlugAliases);
    for (const alias of planLegacyGlobalSlugs(rows, legacy)) {
      await rememberLegacySlug(tx, alias.slug, alias.shootId);
    }
    const shareAliases = await tx
      .select({
        clientId: shootShareAliases.clientId,
        slug: shootShareAliases.slug,
        shootId: shootShareAliases.shootId,
      })
      .from(shootShareAliases);
    const plan = planWithinClientShootSlugs(rows, shareAliases);
    const assigned: PublicSlugBackfillReport["assigned"] = [];
    const recomputed: PublicSlugBackfillReport["recomputed"] = [];
    for (const row of plan) {
      if (!row.changed) continue;
      if (row.previous) await rememberClientShootAlias(tx, row.clientId, row.previous, row.id);
      await tx
        .delete(shootShareAliases)
        .where(
          and(
            eq(shootShareAliases.clientId, row.clientId),
            eq(shootShareAliases.shootId, row.id),
            drizzleSql`lower(${shootShareAliases.slug}) = ${row.slug.toLowerCase()}`,
          ),
        );
      await tx.update(shoots).set({ publicSlug: row.slug }).where(eq(shoots.id, row.id));
      if (row.previous) {
        recomputed.push({ shootId: row.id, address: row.address, from: row.previous, slug: row.slug });
      } else {
        assigned.push({
          shootId: row.id,
          address: row.address,
          slug: row.slug,
          collision: row.collision,
        });
      }
    }
    return { assigned, recomputed, alreadySet: plan.length - assigned.length - recomputed.length };
  });
}
