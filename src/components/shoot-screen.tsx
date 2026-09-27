import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { AdminHeader } from "@/components/admin-header";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { shootZipPath } from "@/lib/download-all";
import { formatShootDate, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { parseClosedShootSections, SHOOT_SECTIONS_COOKIE } from "@/lib/shoot-sections";
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
    publicToken: string;
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
  const closedSectionIds = [
    ...parseClosedShootSections((await cookies()).get(SHOOT_SECTIONS_COOKIE)?.value),
  ];

  return (
    <PhoneShell>
      {admin ? (
        <AdminHeader backHref={`/admin/clients/${shoot.clientId}`} backLabel="Client" />
      ) : (
        <ClientHeader />
      )}
      <ShootDetail
        basePath={admin ? adminShootPath(shoot.clientId, shoot.slug) : clientShootPath(shoot.slug)}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={shootZipPath(shoot.id)}
        shareToken={shoot.publicToken}
        closedSectionIds={closedSectionIds}
        media={files.map((item) => ({
          id: item.id,
          filename: item.filename,
          type: item.type,
          url: resolveMediaUrl(item),
          thumbUrl: resolveMediaThumbUrl(item),
          width: item.width,
          height: item.height,
          renditions: playback.get(item.id) ?? [],
        }))}
      />
    </PhoneShell>
  );
}
