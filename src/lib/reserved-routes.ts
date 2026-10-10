/**
 * First URL segment of a public share link is /<Client-Name>.
 * That segment must never be a real route, or the shoot page would be unreachable.
 * `src/lib/public-share-slug.test.ts` enumerates `src/app` and `public` so a new
 * top-level route fails until it is added here.
 */
export const RESERVED_CLIENT_SLUGS = [
  "home",
  "login",
  "signin",
  "signup",
  "invite",
  "admin",
  "api",
  "oauth",
  ".well-known",
  "well-known",
  "account",
  "s",
  "_next",
  "static",
  "public",
  "assets",
  "images",
  "fonts",
  "choose",
  "scheduling",
  "my-content",
  "forgot-password",
  "reset-password",
  "shoots",
  "favicon.ico",
  "icon",
  "apple-icon",
  "apple-touch-icon.png",
  "apple-touch-icon-precomposed.png",
  "opengraph-image",
  "twitter-image",
  "manifest",
  "manifest.webmanifest",
  "robots",
  "robots.txt",
  "sitemap",
  "sitemap.xml",
  "sw.js",
  "_vercel",
  "brand",
  "samples",
] as const;

const RESERVED = new Set<string>(RESERVED_CLIENT_SLUGS.map((slug) => slug.toLowerCase()));

export function isReservedClientSlug(slug: string) {
  return RESERVED.has(slug.trim().toLowerCase());
}

/** /<Client>/<Shoot>, and not an app route that already owns that first segment. */
export function isPublicShootSharePath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  return !isReservedClientSlug(parts[0] ?? "");
}
