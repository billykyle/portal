import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BkMark } from "@/components/logo";
import { DeleteShootForm } from "@/components/forms/delete-shoot-form";
import { MarkDeliveredForm } from "@/components/forms/mark-delivered-form";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { shootZipPath } from "@/lib/download-all";
import { formatShootDate, resolveMediaThumbUrl, resolveMediaUrl, shootFolderName } from "@/lib/media";
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

  return (
    <PhoneShell>
      <div className="flex items-center justify-between py-6">
        <Link
          href={admin ? `/admin/clients/${shoot.clientId}` : "/library"}
          className="text-sm text-[#8e8e93]"
        >
          {admin ? "Client" : "Library"}
        </Link>
        <BkMark size="header" />
      </div>
      {admin ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 lg:mb-6">
          {!shoot.deliveredAt ? (
            <MarkDeliveredForm clientId={shoot.clientId} shootId={shoot.id} />
          ) : (
            <p className="text-sm text-[#8e8e93]">Marked delivered</p>
          )}
          <DeleteShootForm
            clientId={shoot.clientId}
            shootId={shoot.id}
            address={shoot.address}
          />
        </div>
      ) : null}
      <ShootDetail
        basePath={`/shoots/${shoot.id}`}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        dropboxUrl={shoot.dropboxUrl}
        folderName={shootFolderName(shoot.shotDate, shoot.address)}
        zipUrl={shootZipPath(shoot.id)}
        shareToken={shoot.publicToken}
        showBackup
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
