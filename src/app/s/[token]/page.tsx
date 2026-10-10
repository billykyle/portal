import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { formatShootDate } from "@/lib/media";
import { portalOrigin } from "@/lib/public-link";
import { getLegacyPublicShoot } from "@/lib/public-shoot";
import { shootPageMetadata } from "@/lib/site-metadata";
import { withSearch } from "@/lib/shoot-slug";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const resolved = await getLegacyPublicShoot(token);
    if (!resolved?.redirectTo) return {};
    return shootPageMetadata({
      address: resolved.shoot.address,
      dateLabel: formatShootDate(resolved.shoot.shotDate),
      url: `${portalOrigin()}${resolved.redirectTo}`,
    });
  } catch {
    return {};
  }
}

/** Old /s/<token> and /s/<Shoot-Name> links. The page lives at /<Client>/<Shoot>. */
export default async function LegacyPublicShootPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  const resolved = await getLegacyPublicShoot(token);
  if (!resolved?.redirectTo) {
    notFound();
  }
  const search = view ? `?view=${encodeURIComponent(view)}` : "";
  permanentRedirect(withSearch(resolved.redirectTo, search));
}
