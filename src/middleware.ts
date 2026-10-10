import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { isUuid } from "@/lib/admin/ids";
import { PORTAL_CHOICE_COOKIE, readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { adminHomeRewritePath, hostnameOf, isAdminHostname, isPortalHostname, resolveHostRedirect } from "@/lib/hosts";
import {
  ADMIN_HOME,
  ADMIN_HOME_PAGE,
  CLIENT_HOME,
  PORTAL_CHOOSER,
  isAdminHomePath,
  isClientHomePath,
  legacyClientHomeDestination,
} from "@/lib/routes";
import { resolvePublicShare } from "@/lib/public-share-slug";
import {
  adminShootPath,
  canonicalShootForId,
  clientShootPath,
  resolveClientShoot,
} from "@/lib/shoot-slug";

export const runtime = "nodejs";

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "");
}

async function valid(token: string | undefined) {
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

async function sessionFromCookie(token: string | undefined) {
  if (!token || !process.env.JWT_SECRET) return null;
  return readSessionToken(token);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hostname = hostnameOf(request.headers.get("host") ?? request.nextUrl.host);
  const hostRedirect = resolveHostRedirect({
    hostname,
    pathname,
    search,
  });
  if (hostRedirect) {
    return NextResponse.redirect(hostRedirect.location, hostRedirect.status);
  }

  const publicShare = pathname.match(/^\/s\/([^/]+)$/);
  if (publicShare) {
    const moved = await redirectPublicShare(request, publicShare[1], search);
    if (moved) return moved;
  }

  const legacyHome = legacyClientHomeDestination(pathname);
  if (legacyHome) {
    return redirectTo(request, legacyHome, search);
  }

  const session = await sessionFromCookie(request.cookies.get(SESSION_COOKIE)?.value);
  const choosing = await choosingPortal(request.cookies.get(PORTAL_CHOICE_COOKIE)?.value);
  const admin = await valid(request.cookies.get(ADMIN_COOKIE)?.value);

  const rewritePath = adminHomeRewritePath(hostname, pathname);
  const localAdminHome =
    pathname === ADMIN_HOME && !isAdminHostname(hostname) && !isPortalHostname(hostname) && admin && !session;
  if (rewritePath || localAdminHome) {
    if (!admin) return NextResponse.redirect(new URL("/admin", request.url));
    const url = request.nextUrl.clone();
    url.pathname = rewritePath ?? ADMIN_HOME_PAGE;
    return NextResponse.rewrite(url);
  }

  if (
    (pathname.startsWith("/admin/clients") ||
      pathname.startsWith("/admin/bookings") ||
      pathname.startsWith("/admin/home")) &&
    !admin
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (pathname === "/admin" && admin) {
    const landing = isAdminHostname(hostname) ? ADMIN_HOME : ADMIN_HOME_PAGE;
    return NextResponse.redirect(new URL(landing, request.url));
  }
  if (
    (pathname.startsWith("/my-content") ||
      (isClientHomePath(pathname) && !(isAdminHostname(hostname) && isAdminHomePath(pathname))) ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/scheduling")) &&
    !session
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/shoots") && !session && !admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const legacyShoot = pathname.match(/^\/shoots\/([^/]+)$/);
  if (legacyShoot && isUuid(legacyShoot[1]) && (session || admin)) {
    const moved = await redirectLegacyShoot(request, legacyShoot[1], search, admin);
    if (moved) return moved;
  }
  const contentSlug = pathname.match(/^\/my-content\/([^/]+)$/);
  if (contentSlug && session) {
    const moved = await redirectSlugAlias(request, contentSlug[1], search, session.clientId);
    if (moved) return moved;
  }
  const adminSlug = pathname.match(/^\/admin\/clients\/([^/]+)\/shoots\/([^/]+)$/);
  if (adminSlug && admin && isUuid(adminSlug[1])) {
    const moved = await redirectSlugAlias(request, adminSlug[2], search, adminSlug[1]);
    if (moved) return moved;
  }
  if (session && (pathname === "/" || pathname === "/signup" || pathname === "/signin" || pathname === PORTAL_CHOOSER)) {
    return NextResponse.redirect(new URL(CLIENT_HOME, request.url));
  }
  if (!session && choosing && (pathname === "/" || pathname === "/signup" || pathname === "/signin")) {
    return NextResponse.redirect(new URL(PORTAL_CHOOSER, request.url));
  }
  if (!session && !choosing && pathname === PORTAL_CHOOSER) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  return NextResponse.next();
}

async function choosingPortal(token: string | undefined) {
  if (!token || !process.env.JWT_SECRET) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.purpose === "choose" && Boolean(payload.userId);
  } catch {
    return false;
  }
}

function redirectTo(request: NextRequest, path: string, search: string) {
  const hostRedirect = resolveHostRedirect({
    hostname: request.headers.get("host") ?? request.nextUrl.host,
    pathname: path,
    search,
  });
  const location = hostRedirect?.location ?? new URL(`${path}${search}`, request.url).toString();
  return NextResponse.redirect(location, 308);
}

async function redirectPublicShare(request: NextRequest, rawKey: string, search: string) {
  await ensureDb();
  const resolved = await resolvePublicShare(rawKey);
  if (!resolved?.redirectTo) return null;
  return redirectTo(request, resolved.redirectTo, search);
}

async function redirectLegacyShoot(request: NextRequest, shootId: string, search: string, admin: boolean) {
  await ensureDb();
  const clientId = admin
    ? undefined
    : (await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value ?? ""))?.clientId;
  if (!admin && !clientId) return null;
  const shoot = await canonicalShootForId({ shootId, clientId });
  if (!shoot?.slug) return null;
  const path = admin ? adminShootPath(shoot.clientId, shoot.slug) : clientShootPath(shoot.slug);
  return redirectTo(request, path, search);
}

async function redirectSlugAlias(
  request: NextRequest,
  rawSlug: string,
  search: string,
  clientId: string | null,
) {
  await ensureDb();
  const ownerId =
    clientId ??
    (await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value ?? ""))?.clientId;
  if (!ownerId) return null;
  const slug = decodeURIComponent(rawSlug);
  const resolved = await resolveClientShoot(ownerId, slug);
  if (!resolved?.redirectTo || resolved.redirectTo === slug) return null;
  const path = clientId ? adminShootPath(clientId, resolved.redirectTo) : clientShootPath(resolved.redirectTo);
  return redirectTo(request, path, search);
}

export const config = {
  matcher: [
    "/",
    "/signup",
    "/signin",
    "/choose",
    "/forgot-password",
    "/reset-password",
    "/home",
    "/home/:path*",
    "/hub",
    "/hub/:path*",
    "/account",
    "/account/:path*",
    "/scheduling",
    "/scheduling/:path*",
    "/my-content",
    "/my-content/:path*",
    "/s",
    "/s/:path*",
    "/shoots/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
