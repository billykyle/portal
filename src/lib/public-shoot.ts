import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { shoots } from "@/lib/db/schema";

export const getPublicShoot = cache(async (token: string) => {
  await ensureDb();
  const [shoot] = await db.select().from(shoots).where(eq(shoots.publicToken, token)).limit(1);
  return shoot ?? null;
});
