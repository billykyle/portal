import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PhoneShell } from "@/components/phone-shell";
import { ShootDetail } from "@/components/shoot-detail";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { media, shoots } from "@/lib/db/schema";
import { formatShootDate, resolveMediaUrl, shootFolderName } from "@/lib/media";

export default async function ShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  const { id } = await params;
  const { view } = await searchParams;
  await ensureDb();
  const [shoot] = await db
    .select()
    .from(shoots)
    .where(and(eq(shoots.id, id), eq(shoots.clientId, session.clientId)))
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
      <div className="py-6">
        <Link href="/library" className="text-sm text-[#8e8e93]">
          Library
        </Link>
      </div>
      <ShootDetail
        shootId={shoot.id}
        viewId={view}
        address={shoot.address}
        dateLabel={formatShootDate(shoot.shotDate)}
        dropboxUrl={shoot.dropboxUrl}
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
