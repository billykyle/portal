import { and, asc, eq } from "drizzle-orm";
import { portalOrigin } from "@/lib/hosts";
import { db } from "@/lib/db";
import { shootSlugAliases, shoots } from "@/lib/db/schema";

const SLUG_MAX = 80;

/** Kebab-case of the shoot title (the address shown on the page). */
export function slugifyShootTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug || "shoot";
}

/**
 * First free slug for this client.
 * Bare title, then title-date, then title-2, title-3, ...
 */
export function chooseShootSlug(title: string, shotDate: string, taken: ReadonlySet<string>) {
  const base = slugifyShootTitle(title);
  if (!taken.has(base)) return base;
  const date = shotDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const dated = `${base}-${date}`.slice(0, SLUG_MAX + 11).replace(/-+$/g, "");
    if (!taken.has(dated)) return dated;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** True when the stored slug still belongs to this title, including a collision suffix. */
export function slugMatchesTitle(slug: string, title: string, shotDate: string) {
  const base = slugifyShootTitle(title);
  if (slug === base) return true;
  const date = shotDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && slug === `${base}-${date}`) return true;
  return new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`).test(slug);
}

export function clientShootPath(slug: string) {
  return `/my-content/${slug}`;
}

export function adminShootPath(clientId: string, slug: string) {
  return `/admin/clients/${clientId}/shoots/${slug}`;
}

export function clientShootUrl(slug: string) {
  return `${portalOrigin()}${clientShootPath(slug)}`;
}

export function withSearch(path: string, search: string) {
  if (!search || search === "?") return path;
  return `${path}${search.startsWith("?") ? search : `?${search}`}`;
}

async function takenSlugs(clientId: string, exceptShootId?: string) {
  const [current, aliases] = await Promise.all([
    db.select({ id: shoots.id, slug: shoots.slug }).from(shoots).where(eq(shoots.clientId, clientId)),
    db
      .select({ shootId: shootSlugAliases.shootId, slug: shootSlugAliases.slug })
      .from(shootSlugAliases)
      .where(eq(shootSlugAliases.clientId, clientId)),
  ]);
  const taken = new Set<string>();
  for (const row of current) {
    if (!row.slug || row.id === exceptShootId) continue;
    taken.add(row.slug);
  }
  for (const row of aliases) {
    if (row.shootId === exceptShootId) continue;
    taken.add(row.slug);
  }
  return taken;
}

export async function allocateShootSlug(input: {
  clientId: string;
  title: string;
  shotDate: string;
  exceptShootId?: string;
}) {
  const taken = await takenSlugs(input.clientId, input.exceptShootId);
  return chooseShootSlug(input.title, input.shotDate, taken);
}

/** Keep the issued slug unless the title's kebab-case changed. Old slugs stay reachable. */
export async function syncShootSlug(input: {
  shootId: string;
  clientId: string;
  title: string;
  shotDate: string;
  slug: string | null;
}) {
  if (input.slug && slugMatchesTitle(input.slug, input.title, input.shotDate)) return input.slug;
  const next = await allocateShootSlug({
    clientId: input.clientId,
    title: input.title,
    shotDate: input.shotDate,
    exceptShootId: input.shootId,
  });
  if (next === input.slug) return next;
  if (input.slug) {
    await db
      .insert(shootSlugAliases)
      .values({ clientId: input.clientId, slug: input.slug, shootId: input.shootId })
      .onConflictDoNothing();
  }
  await db
    .delete(shootSlugAliases)
    .where(and(eq(shootSlugAliases.clientId, input.clientId), eq(shootSlugAliases.slug, next)));
  await db.update(shoots).set({ slug: next }).where(eq(shoots.id, input.shootId));
  return next;
}

/** Current slug, or the shoot an older slug still points at. */
export async function resolveClientShoot(clientId: string, slug: string) {
  const [current] = await db
    .select()
    .from(shoots)
    .where(and(eq(shoots.clientId, clientId), eq(shoots.slug, slug)))
    .limit(1);
  if (current) return { shoot: current, redirectTo: null as string | null };
  const [alias] = await db
    .select({ shootId: shootSlugAliases.shootId })
    .from(shootSlugAliases)
    .where(and(eq(shootSlugAliases.clientId, clientId), eq(shootSlugAliases.slug, slug)))
    .limit(1);
  if (!alias) return null;
  const [shoot] = await db.select().from(shoots).where(eq(shoots.id, alias.shootId)).limit(1);
  if (!shoot) return null;
  return { shoot, redirectTo: shoot.slug };
}

export async function backfillShootSlugs() {
  const rows = await db
    .select({
      id: shoots.id,
      clientId: shoots.clientId,
      address: shoots.address,
      shotDate: shoots.shotDate,
      slug: shoots.slug,
    })
    .from(shoots)
    .orderBy(asc(shoots.createdAt), asc(shoots.id));
  const takenByClient = new Map<string, Set<string>>();
  const aliases = await db
    .select({ clientId: shootSlugAliases.clientId, slug: shootSlugAliases.slug })
    .from(shootSlugAliases);
  for (const alias of aliases) {
    const taken = takenByClient.get(alias.clientId) ?? new Set<string>();
    taken.add(alias.slug);
    takenByClient.set(alias.clientId, taken);
  }
  for (const row of rows) {
    const taken = takenByClient.get(row.clientId) ?? new Set<string>();
    takenByClient.set(row.clientId, taken);
    if (row.slug) {
      taken.add(row.slug);
      continue;
    }
    const slug = chooseShootSlug(row.address, row.shotDate, taken);
    await db.update(shoots).set({ slug }).where(eq(shoots.id, row.id));
    taken.add(slug);
  }
}
