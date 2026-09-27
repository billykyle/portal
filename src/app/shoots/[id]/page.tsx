import { and, eq } from "drizzle-orm";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { isUuid } from "@/lib/admin/ids";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { shoots } from "@/lib/db/schema";
import { adminShootPath, clientShootPath, syncShootSlug, withSearch } from "@/lib/shoot-slug";

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
  if (!isUuid(id)) {
    notFound();
  }
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
  const slug =
    shoot.slug ||
    (await syncShootSlug({
      shootId: shoot.id,
      clientId: shoot.clientId,
      title: shoot.address,
      shotDate: shoot.shotDate,
      slug: null,
    }));
  const path = admin ? adminShootPath(shoot.clientId, slug) : clientShootPath(slug);
  permanentRedirect(withSearch(path, view ? `?view=${encodeURIComponent(view)}` : ""));
}
