import { randomBytes } from "crypto";
import { portalOrigin } from "@/lib/hosts";

export { portalOrigin } from "@/lib/hosts";

/** Unguessable, URL-safe token. Stable for the life of the shoot. */
export function createPublicToken() {
  return randomBytes(18).toString("base64url");
}

export function publicShootPath(token: string) {
  return `/s/${token}`;
}

export function publicShootUrl(token: string) {
  return `${portalOrigin()}${publicShootPath(token)}`;
}
