import { randomBytes } from "crypto";

/** Unguessable, URL-safe token. Stable for the life of the shoot. */
export function createPublicToken() {
  return randomBytes(18).toString("base64url");
}

export function publicShootPath(token: string) {
  return `/s/${token}`;
}

export function portalOrigin() {
  return (process.env.PORTAL_PUBLIC_URL ?? "http://127.0.0.1:43173").replace(/\/+$/, "");
}

export function publicShootUrl(token: string) {
  return `${portalOrigin()}${publicShootPath(token)}`;
}
