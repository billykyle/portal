import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BkMark } from "@/components/logo";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { formatShootDate, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { publicShootPath } from "@/lib/public-link";

export default async function PublicShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  await ensureDb();
  const [shoot] = await db.select().from(shoots).where(eq(shoots.publicToken, token)).limit(1);
  if (!shoot) {
    notFound();
  }
  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));

  return (
    <PhoneShell>
      <header className="flex justify-center py-6">
        <BkMark className="h-7" />
      </header>
      <ShootDetail
        basePath={publicShootPath(shoot.publicToken)}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        dropboxUrl={null}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        media={files.map((item) => ({
          id: item.id,
          filename: item.filename,
          type: item.type,
          url: resolveMediaUrl(item),
        }))}
      />
    </PhoneShell>
  );
}
