import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ShootScreen } from "@/components/shoot-screen";
import { getAdminSession } from "@/lib/admin-auth";
import { isUuid } from "@/lib/admin/ids";
import { ensureDb } from "@/lib/db/ensure";
import { formatShootDate } from "@/lib/media";
import { adminShootPath, resolveClientShoot, withSearch } from "@/lib/shoot-slug";
import { shootPageMetadata } from "@/lib/site-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}): Promise<Metadata> {
  if (!(await getAdminSession())) return {};
  const { id, slug } = await params;
  if (!isUuid(id)) return {};
  try {
    await ensureDb();
    const resolved = await resolveClientShoot(id, slug);
    if (!resolved) return {};
    return shootPageMetadata({
      address: resolved.shoot.address,
      dateLabel: formatShootDate(resolved.shoot.shotDate),
    });
  } catch {
    return {};
  }
}

export default async function AdminShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  if (!(await getAdminSession())) {
    redirect("/admin");
  }
  const { id, slug } = await params;
  const { view } = await searchParams;
  if (!isUuid(id)) {
    notFound();
  }
  await ensureDb();
  const resolved = await resolveClientShoot(id, slug);
  if (!resolved || resolved.shoot.clientId !== id) {
    notFound();
  }
  const search = view ? `?view=${encodeURIComponent(view)}` : "";
  if (resolved.redirectTo) {
    permanentRedirect(withSearch(adminShootPath(id, resolved.redirectTo), search));
  }
  return <ShootScreen shoot={resolved.shoot} view={view} admin />;
}
