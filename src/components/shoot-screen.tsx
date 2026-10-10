import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { AdminHeader } from "@/components/admin-header";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { contentTemplate } from "@/components/templates/registry";
import { db } from "@/lib/db";
import { clients, media } from "@/lib/db/schema";
import { shootZipPath } from "@/lib/download-all";
import { formatShootDate, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { parseListShootSections, SHOOT_LAYOUT_COOKIE } from "@/lib/shoot-layout";
import { parseClosedShootSections, SHOOT_SECTIONS_COOKIE } from "@/lib/shoot-sections";
import { publicShootUrl } from "@/lib/public-link";
import { adminShootPath, clientShootPath } from "@/lib/shoot-slug";
import { videoPlaybackById } from "@/lib/video-store";

export async function ShootScreen({
  shoot,
  view,
  admin,
}: {
  shoot: {
    id: string;
    clientId: string;
    slug: string;
    address: string;
    shotDate: string;
    publicSlug: string;
  };
  view?: string;
  admin: boolean;
}) {
  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));
  const playback = await videoPlaybackById(files);
  const jar = await cookies();
  const closedSectionIds = [...parseClosedShootSections(jar.get(SHOOT_SECTIONS_COOKIE)?.value)];
  const listSectionIds = [...parseListShootSections(jar.get(SHOOT_LAYOUT_COOKIE)?.value)];
  const [owner] = await db
    .select({ category: clients.category })
    .from(clients)
    .where(eq(clients.id, shoot.clientId))
    .limit(1);
  const ShootView = contentTemplate(owner?.category ?? "other").Shoot;

  return (
    <PhoneShell>
      {admin ? (
        <AdminHeader />
      ) : (
        <ClientHeader />
      )}
      <ShootView
        basePath={admin ? adminShootPath(shoot.clientId, shoot.slug) : clientShootPath(shoot.slug)}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={shootZipPath(shoot.id)}
        shareUrl={publicShootUrl(shoot.publicSlug)}
        closedSectionIds={closedSectionIds}
        listSectionIds={listSectionIds}
        media={files.map((item) => ({
          id: item.id,
          filename: item.filename,
          type: item.type,
          url: resolveMediaUrl(item),
          thumbUrl: resolveMediaThumbUrl(item),
          width: item.width,
          height: item.height,
          byteSize: item.byteSize,
          sortOrder: item.sortOrder,
          renditions: playback.get(item.id) ?? [],
        }))}
      />
    </PhoneShell>
  );
}
