import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin-header";
import { ClientHeader } from "@/components/client-header";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { shootZipPath } from "@/lib/download-all";
import { formatShootDate, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
import { videoPlaybackById } from "@/lib/video-store";
import { shootPageMetadata } from "@/lib/site-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    await ensureDb();
    const [shoot] = await db.select().from(shoots).where(eq(shoots.id, id)).limit(1);
    if (!shoot) return {};
    return shootPageMetadata({
      address: shoot.address,
      dateLabel: formatShootDate(shoot.shotDate),
    });
  } catch {
    return {};
  }
}

export default async function ShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const admin = await getAdminSession();
  const session = await getSession();
  if (!admin && !session) {
    redirect("/");
  }
  const { id } = await params;
  const { view } = await searchParams;
  await ensureDb();
  const [shoot] = admin
    ? await db.select().from(shoots).where(eq(shoots.id, id)).limit(1)
    : await db
        .select()
        .from(shoots)
        .where(and(eq(shoots.id, id), eq(shoots.clientId, session!.clientId)))
        .limit(1);
  if (!shoot) {
    notFound();
  }
  const files = await db
    .select()
    .from(media)
    .where(eq(media.shootId, shoot.id))
    .orderBy(asc(media.sortOrder));
  const playback = await videoPlaybackById(files);

  return (
    <PhoneShell>
      {admin ? (
        <AdminHeader backHref={`/admin/clients/${shoot.clientId}`} backLabel="Client" />
      ) : (
        <ClientHeader />
      )}
      <ShootDetail
        basePath={`/shoots/${shoot.id}`}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={shootZipPath(shoot.id)}
        shareToken={shoot.publicToken}
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
