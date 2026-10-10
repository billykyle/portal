import { asc, eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/lib/db";
import { shootPublicSlugAliases, shoots } from "@/lib/db/schema";
import { publicShootPath } from "@/lib/public-link";

/** Serializes slug allocation so two shoots cannot claim the same name. */
const PUBLIC_SLUG_LOCK = 4815162342;

/**
 * Shoot name → /s/<slug>.
 * Spaces become "-", anything except letters, digits, and "-" is removed,
 * and repeated dashes collapse. Capitalization is kept.
 */
export function slugifyPublicShare(title: string) {
  const slug = title
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{Nd}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "shoot";
}

/** First free slug. The set is compared case-insensitively. Collisions are -2, -3, ... */
export function choosePublicShareSlug(title: string, taken: ReadonlySet<string>) {
  const folded = new Set([...taken].map((slug) => slug.toLowerCase()));
  const base = slugifyPublicShare(title);
  if (!folded.has(base.toLowerCase())) return base;
  let n = 2;
  while (folded.has(`${base}-${n}`.toLowerCase())) n += 1;
  return `${base}-${n}`;
}

/** True when this slug was issued for this title, including a -2/-3 collision suffix. */
export function publicSlugMatchesTitle(slug: string, title: string) {
  const base = slugifyPublicShare(title);
  if (slug === base) return true;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}-\\d+$`).test(slug);
}

export type PublicShareRecord = {
  id: string;
  publicToken: string;
  publicSlug: string;
};

export type PublicShareVia = "slug" | "alias" | "token";

/**
 * Resolve a /s/<key> segment.
 * Current slug (any case), then a retired slug, then the legacy random token.
 */
export function matchPublicShare(
  key: string,
  rows: readonly PublicShareRecord[],
  aliases: readonly { slug: string; shootId: string }[],
): { shoot: PublicShareRecord; via: PublicShareVia } | null {
  const folded = key.toLowerCase();
  const bySlug = rows.find((row) => row.publicSlug.toLowerCase() === folded);
  if (bySlug) return { shoot: bySlug, via: "slug" };
  const alias = aliases.find((row) => row.slug.toLowerCase() === folded);
  if (alias) {
    const shoot = rows.find((row) => row.id === alias.shootId);
    if (shoot) return { shoot, via: "alias" };
  }
  const byToken = rows.find((row) => row.publicToken === key);
  if (byToken) return { shoot: byToken, via: "token" };
  return null;
}

export function decodePublicShareKey(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Canonical slug serves the page. Every other key permanently redirects to it. */
export function publicShareRedirect(input: {
  key: string;
  canonicalSlug: string;
  via: PublicShareVia;
}): { pathname: string; status: 308 } | null {
  if (input.via === "slug" && input.key === input.canonicalSlug) return null;
  return { pathname: publicShootPath(input.canonicalSlug), status: 308 };
}

export type PublicSlugPlanRow = {
  id: string;
  address: string;
  slug: string;
  collision: boolean;
  assigned: boolean;
};

/** Assign missing slugs in the given order. Existing slugs and aliases stay taken. */
export function planPublicShareSlugs(
  rows: readonly { id: string; address: string; publicSlug: string | null }[],
  aliasSlugs: readonly string[] = [],
): PublicSlugPlanRow[] {
  const taken = new Set(aliasSlugs.map((slug) => slug.toLowerCase()));
  const plan: PublicSlugPlanRow[] = [];
  for (const row of rows) {
    if (row.publicSlug) {
      taken.add(row.publicSlug.toLowerCase());
      plan.push({
        id: row.id,
        address: row.address,
        slug: row.publicSlug,
        collision: false,
        assigned: false,
      });
      continue;
    }
    const base = slugifyPublicShare(row.address);
    const slug = choosePublicShareSlug(row.address, taken);
    taken.add(slug.toLowerCase());
    plan.push({
      id: row.id,
      address: row.address,
      slug,
      collision: slug !== base,
      assigned: true,
    });
  }
  return plan;
}

export type PublicSlugBackfillReport = {
  assigned: { shootId: string; address: string; slug: string; collision: boolean }[];
  alreadySet: number;
};

export function formatPublicSlugBackfill(report: PublicSlugBackfillReport) {
  const collisions = report.assigned.filter((row) => row.collision);
  const count = `Backfilled ${report.assigned.length} public shoot slug${report.assigned.length === 1 ? "" : "s"}.`;
  if (collisions.length === 0) return `${count} No slug collisions.`;
  const list = collisions.map((row) => `${row.address} -> /s/${row.slug}`).join("; ");
  return `${count} Collisions (${collisions.length}): ${list}`;
}

type Query = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

async function withSlugLock<T>(fn: (tx: Query) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(drizzleSql`select pg_advisory_xact_lock(${PUBLIC_SLUG_LOCK})`);
    return fn(tx);
  });
}

async function takenPublicSlugs(database: Query, exceptShootId?: string) {
  const [current, aliases] = await Promise.all([
    database.select({ id: shoots.id, slug: shoots.publicSlug }).from(shoots),
    database
      .select({ shootId: shootPublicSlugAliases.shootId, slug: shootPublicSlugAliases.slug })
      .from(shootPublicSlugAliases),
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

export async function allocatePublicShareSlug(input: { title: string; exceptShootId?: string }) {
  return withSlugLock(async (tx) => {
    const taken = await takenPublicSlugs(tx, input.exceptShootId);
    return choosePublicShareSlug(input.title, taken);
  });
}

/** Keep the issued slug unless the shoot name's slug changed. The previous slug keeps redirecting. */
export async function syncPublicShareSlug(input: {
  shootId: string;
  title: string;
  slug: string | null;
}) {
  if (input.slug && publicSlugMatchesTitle(input.slug, input.title)) return input.slug;
  return withSlugLock(async (tx) => {
    const taken = await takenPublicSlugs(tx, input.shootId);
    const next = choosePublicShareSlug(input.title, taken);
    if (next === input.slug) return next;
    if (input.slug) {
      const [owner] = await tx
        .select({ shootId: shootPublicSlugAliases.shootId })
        .from(shootPublicSlugAliases)
        .where(drizzleSql`lower(${shootPublicSlugAliases.slug}) = ${input.slug.toLowerCase()}`)
        .limit(1);
      if (!owner) {
        await tx.insert(shootPublicSlugAliases).values({ slug: input.slug, shootId: input.shootId });
      }
    }
    await tx
      .delete(shootPublicSlugAliases)
      .where(
        drizzleSql`lower(${shootPublicSlugAliases.slug}) = ${next.toLowerCase()} and ${shootPublicSlugAliases.shootId} = ${input.shootId}`,
      );
    await tx.update(shoots).set({ publicSlug: next }).where(eq(shoots.id, input.shootId));
    return next;
  });
}

export async function resolvePublicShare(rawKey: string) {
  const key = decodePublicShareKey(rawKey).trim();
  if (!key) return null;
  const folded = key.toLowerCase();
  const [bySlug] = await db
    .select()
    .from(shoots)
    .where(drizzleSql`lower(${shoots.publicSlug}) = ${folded}`)
    .limit(1);
  if (bySlug?.publicSlug) {
    const redirect = publicShareRedirect({
      key,
      canonicalSlug: bySlug.publicSlug,
      via: "slug",
    });
    return { shoot: bySlug, via: "slug" as const, redirectTo: redirect?.pathname ?? null };
  }
  const [alias] = await db
    .select({ shootId: shootPublicSlugAliases.shootId })
    .from(shootPublicSlugAliases)
    .where(drizzleSql`lower(${shootPublicSlugAliases.slug}) = ${folded}`)
    .limit(1);
  if (alias) {
    const [shoot] = await db.select().from(shoots).where(eq(shoots.id, alias.shootId)).limit(1);
    if (shoot?.publicSlug) {
      const redirect = publicShareRedirect({
        key,
        canonicalSlug: shoot.publicSlug,
        via: "alias",
      });
      return { shoot, via: "alias" as const, redirectTo: redirect?.pathname ?? null };
    }
  }
  const [byToken] = await db.select().from(shoots).where(eq(shoots.publicToken, key)).limit(1);
  if (byToken?.publicSlug) {
    const redirect = publicShareRedirect({
      key,
      canonicalSlug: byToken.publicSlug,
      via: "token",
    });
    return { shoot: byToken, via: "token" as const, redirectTo: redirect?.pathname ?? null };
  }
  return null;
}

export async function backfillPublicShareSlugs(): Promise<PublicSlugBackfillReport> {
  return withSlugLock(async (tx) => {
    const rows = await tx
      .select({
        id: shoots.id,
        address: shoots.address,
        publicSlug: shoots.publicSlug,
      })
      .from(shoots)
      .orderBy(asc(shoots.createdAt), asc(shoots.id));
    const aliases = await tx
      .select({ slug: shootPublicSlugAliases.slug })
      .from(shootPublicSlugAliases);
    const plan = planPublicShareSlugs(
      rows.map((row) => ({ id: row.id, address: row.address, publicSlug: row.publicSlug })),
      aliases.map((row) => row.slug),
    );
    const assigned: PublicSlugBackfillReport["assigned"] = [];
    for (const row of plan) {
      if (!row.assigned) continue;
      await tx.update(shoots).set({ publicSlug: row.slug }).where(eq(shoots.id, row.id));
      assigned.push({
        shootId: row.id,
        address: row.address,
        slug: row.slug,
        collision: row.collision,
      });
    }
    return { assigned, alreadySet: plan.length - assigned.length };
  });
}
