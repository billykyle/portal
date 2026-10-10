import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { contentTemplate } from "@/components/templates/registry";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, media, shoots } from "@/lib/db/schema";
import { coverUrlByShoot } from "@/lib/episode-covers";
import { formatShootDate, shootFolderName } from "@/lib/media";
import { parseClosedCategoryFolders, SHOOT_CATEGORY_FOLDERS_COOKIE } from "@/lib/shoot-categories";
import { publicShootUrl } from "@/lib/public-link";
import { clientShootPath } from "@/lib/shoot-slug";

export const metadata: Metadata = {
  title: "My Content",
};

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const closedCategoryFolders = [
    ...parseClosedCategoryFolders((await cookies()).get(SHOOT_CATEGORY_FOLDERS_COOKIE)?.value),
  ];
  const [[client], rows] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1),
    db
      .select()
      .from(shoots)
      .where(eq(shoots.clientId, session.clientId))
      .orderBy(desc(shoots.shotDate), desc(shoots.createdAt)),
  ]);
  const category = client?.category ?? "other";
  const covers =
    category === "podcast" && rows.length > 0
      ? coverUrlByShoot(
          await db
            .select()
            .from(media)
            .where(
              inArray(
                media.shootId,
                rows.map((shoot) => shoot.id),
              ),
            )
            .orderBy(asc(media.sortOrder)),
        )
      : new Map<string, string | null>();
  const Library = contentTemplate(category).Library;

  return (
    <PhoneShell>
      <ClientHeader />
      <Library
        client={
          client
            ? {
                displayName: client.displayName,
                primaryEmail: client.primaryEmail,
                company: client.company,
              }
            : null
        }
        closedCategoryFolders={closedCategoryFolders}
        shoots={rows.map((shoot) => ({
          id: shoot.id,
          href: clientShootPath(shoot.slug),
          address: shoot.address,
          shotDate: shoot.shotDate,
          dateLabel: formatShootDate(shoot.shotDate),
          folderName: shootFolderName(shoot.shotDate, shoot.address),
          thumbUrl: covers.get(shoot.id) ?? null,
          fileCount: 0,
          publicUrl: publicShootUrl(shoot.publicSlug),
          categoryFolder: shoot.categoryFolder,
        }))}
      />
    </PhoneShell>
  );
}
