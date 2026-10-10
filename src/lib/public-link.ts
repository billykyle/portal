import { randomBytes } from "crypto";
import { portalOrigin } from "@/lib/hosts";

export { portalOrigin } from "@/lib/hosts";

/** Unguessable, URL-safe token. Stable for the life of the shoot. */
export function createPublicToken() {
  return randomBytes(18).toString("base64url");
}

export function publicShootPath(clientSlug: string, shootSlug: string) {
  return `/${encodeURIComponent(clientSlug)}/${encodeURIComponent(shootSlug)}`;
}

/** Absolute share link. Uses PORTAL_PUBLIC_URL, never the admin host. */
export function publicShootUrl(clientSlug: string, shootSlug: string) {
  return `${portalOrigin()}${publicShootPath(clientSlug, shootSlug)}`;
}
