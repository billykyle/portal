/** Locked production hosts. Flynn adds the admin DNS CNAME separately. */
export const PRODUCTION_PORTAL_HOST = "portal.billy-kyle.com";
export const PRODUCTION_ADMIN_HOST = "admin.billy-kyle.com";

export const DEFAULT_LOCAL_ORIGIN = "http://127.0.0.1:43173";
export const DEFAULT_PORTAL_ORIGIN = `https://${PRODUCTION_PORTAL_HOST}`;
export const DEFAULT_ADMIN_ORIGIN = `https://${PRODUCTION_ADMIN_HOST}`;

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/** Client / public-link origin. Local default stays loopback so webhooks work in `next dev`. */
export function portalOrigin() {
  return stripTrailingSlash(process.env.PORTAL_PUBLIC_URL ?? DEFAULT_LOCAL_ORIGIN);
}

/** Billy-only admin origin. Production default so emails never point at portal `/admin`. */
export function adminOrigin() {
  return stripTrailingSlash(process.env.ADMIN_PUBLIC_URL ?? DEFAULT_ADMIN_ORIGIN);
}

export function adminUrl(path = "/admin") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${adminOrigin()}${suffix}`;
}

export function hostnameOf(hostOrUrl: string) {
  const raw = hostOrUrl.trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`http://${raw}`);
    return url.hostname;
  } catch {
    return raw.split("/")[0]?.split(":")[0] ?? "";
  }
}

export function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]";
}

export function isAdminHostname(hostname: string) {
  if (!hostname || isLocalHostname(hostname)) return false;
  if (hostname === PRODUCTION_ADMIN_HOST) return true;
  const configured = hostnameOf(adminOrigin());
  return Boolean(configured) && !isLocalHostname(configured) && hostname === configured;
}

export function isVercelAppHostname(hostname: string) {
  return hostname.endsWith(".vercel.app");
}

/**
 * Portal entry hosts: the locked client domain, PORTAL_PUBLIC_URL when it is not loopback,
 * and Vercel preview / production aliases for this same project.
 */
export function isPortalHostname(hostname: string) {
  if (!hostname || isAdminHostname(hostname) || isLocalHostname(hostname)) return false;
  if (hostname === PRODUCTION_PORTAL_HOST || hostname === `www.${PRODUCTION_PORTAL_HOST}`) return true;
  const configured = hostnameOf(portalOrigin());
  if (configured && !isLocalHostname(configured) && hostname === configured) return true;
  return isVercelAppHostname(hostname);
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

const CLIENT_PORTAL_PREFIXES = [
  "/hub",
  "/library",
  "/account",
  "/scheduling",
  "/signup",
  "/signin",
  "/forgot-password",
  "/reset-password",
  "/s",
];

/** Client hub / library / public share — stay on the portal host only. */
export function isClientPortalPath(pathname: string) {
  return CLIENT_PORTAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Public portal origin for cross-host redirects. Never send Billy to loopback. */
export function publicPortalOrigin() {
  const origin = portalOrigin();
  const host = hostnameOf(origin);
  if (!host || isLocalHostname(host)) return DEFAULT_PORTAL_ORIGIN;
  return origin;
}

export type HostRedirect = {
  location: string;
  status: 308;
};

export function resolveHostRedirect(input: {
  hostname: string;
  pathname: string;
  search?: string;
}): HostRedirect | null {
  const hostname = hostnameOf(input.hostname);
  const pathname = input.pathname || "/";
  const search = input.search ?? "";

  if (isPortalHostname(hostname) && isAdminPath(pathname)) {
    return { location: `${adminOrigin()}${pathname}${search}`, status: 308 };
  }

  if (isAdminHostname(hostname)) {
    if (pathname === "/") {
      return { location: `${adminOrigin()}/admin${search}`, status: 308 };
    }
    if (isClientPortalPath(pathname)) {
      return { location: `${publicPortalOrigin()}${pathname}${search}`, status: 308 };
    }
  }

  return null;
}
