import { randomBytes } from "crypto";

/** Unguessable, URL-safe token. Stable for the life of the shoot. */
export function createPublicToken() {
  return randomBytes(18).toString("base64url");
}

export function publicShootPath(token: string) {
  return `/s/${token}`;
}
