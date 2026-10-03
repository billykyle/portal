import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ShootScreen } from "@/components/shoot-screen";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { formatShootDate } from "@/lib/media";
import { resolveShootForPage } from "@/lib/resolve-shoot-page";
import { clientShootPath, clientShootUrl, withSearch } from "@/lib/shoot-slug";
import { shootPageMetadata } from "@/lib/site-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const session = await getSession();
  if (!session) return {};
  const { slug } = await params;
  try {
    await ensureDb();
    const resolved = await resolveShootForPage(session.clientId, slug);
    if (!resolved) return {};
    return shootPageMetadata({
      address: resolved.shoot.address,
      dateLabel: formatShootDate(resolved.shoot.shotDate),
      url: clientShootUrl(resolved.shoot.slug),
    });
  } catch {
    return {};
  }
}

export default async function ClientShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  const { slug } = await params;
  const { view } = await searchParams;
  await ensureDb();
  const resolved = await resolveShootForPage(session.clientId, slug);
  if (!resolved) {
    notFound();
  }
  const search = view ? `?view=${encodeURIComponent(view)}` : "";
  if (resolved.redirectTo) {
    permanentRedirect(withSearch(clientShootPath(resolved.redirectTo), search));
  }
  return <ShootScreen shoot={resolved.shoot} view={view} admin={false} />;
}
