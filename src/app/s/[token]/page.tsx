import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { publicShootZipPath } from "@/lib/download-all";
import { formatShootDate, isShootGalleryType, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { videoPlaybackById } from "@/lib/video-store";
import { publicShootPath, publicShootUrl } from "@/lib/public-link";
import { getPublicShoot } from "@/lib/public-shoot";
import { shootPageMetadata } from "@/lib/site-metadata";
import { withSearch } from "@/lib/shoot-slug";
import { parseListShootSections, SHOOT_LAYOUT_COOKIE } from "@/lib/shoot-layout";
import { parseClosedShootSections, SHOOT_SECTIONS_COOKIE } from "@/lib/shoot-sections";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const resolved = await getPublicShoot(token);
    if (!resolved) return {};
    return shootPageMetadata({
      address: resolved.shoot.address,
      dateLabel: formatShootDate(resolved.shoot.shotDate),
      url: publicShootUrl(resolved.shoot.publicSlug),
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
  const resolved = await getPublicShoot(token);
  if (!resolved) {
    notFound();
  }
  const search = view ? `?view=${encodeURIComponent(view)}` : "";
  if (resolved.redirectTo) {
    permanentRedirect(withSearch(resolved.redirectTo, search));
  }
  const shoot = resolved.shoot;
  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));
  const playback = await videoPlaybackById(files);
  const jar = await cookies();
  const closedSectionIds = [...parseClosedShootSections(jar.get(SHOOT_SECTIONS_COOKIE)?.value)];
  const listSectionIds = [...parseListShootSections(jar.get(SHOOT_LAYOUT_COOKIE)?.value)];

  return (
    <PhoneShell>
      <AppHeader />
      <ShootDetail
        basePath={publicShootPath(shoot.publicSlug)}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={publicShootZipPath(shoot.publicSlug)}
        closedSectionIds={closedSectionIds}
        listSectionIds={listSectionIds}
        media={files.flatMap((item) => {
          if (!isShootGalleryType(item.type)) return [];
          return [
            {
              id: item.id,
              filename: item.filename,
              type: item.type,
              url: resolveMediaUrl(item),
              thumbUrl: resolveMediaThumbUrl(item),
              width: item.width,
              height: item.height,
              byteSize: item.byteSize,
              renditions: playback.get(item.id) ?? [],
            },
          ];
        })}
      />
    </PhoneShell>
  );
}
