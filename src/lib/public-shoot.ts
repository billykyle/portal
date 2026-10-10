import { cache } from "react";
import { ensureDb } from "@/lib/db/ensure";
import { resolvePublicShare, resolvePublicShootPath } from "@/lib/public-share-slug";

export const getPublicShoot = cache(async (clientSlug: string, shootSlug: string) => {
  await ensureDb();
  return resolvePublicShootPath(clientSlug, shootSlug);
});

export const getLegacyPublicShoot = cache(async (key: string) => {
  await ensureDb();
  return resolvePublicShare(key);
});
