import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { publicShootZipPath } from "@/lib/download-all";
import { formatShootDate, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { publicShootPath, publicShootUrl } from "@/lib/public-link";
import { getPublicShoot } from "@/lib/public-shoot";
import { shootPageMetadata } from "@/lib/site-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const shoot = await getPublicShoot(token);
    if (!shoot) return {};
    return shootPageMetadata({
      address: shoot.address,
      dateLabel: formatShootDate(shoot.shotDate),
      url: publicShootUrl(shoot.publicToken),
    });
  } catch {
    return {};
  }
}

export default async function PublicShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  const shoot = await getPublicShoot(token);
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
      <AppHeader />
      <ShootDetail
        basePath={publicShootPath(shoot.publicToken)}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        dropboxUrl={null}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={publicShootZipPath(shoot.publicToken)}
        media={files.map((item) => ({
          id: item.id,
          filename: item.filename,
          type: item.type,
          url: resolveMediaUrl(item),
          thumbUrl: resolveMediaThumbUrl(item),
        }))}
      />
    </PhoneShell>
  );
}
