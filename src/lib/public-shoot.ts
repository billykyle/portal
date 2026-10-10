import { cache } from "react";
import { ensureDb } from "@/lib/db/ensure";
import { resolvePublicShare } from "@/lib/public-share-slug";

export const getPublicShoot = cache(async (key: string) => {
  await ensureDb();
  return resolvePublicShare(key);
});
