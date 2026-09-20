import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { SESSION_COOKIE } from "@/lib/auth";
import { resolveHostRedirect } from "@/lib/hosts";
import { CLIENT_HOME } from "@/lib/routes";

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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hostRedirect = resolveHostRedirect({
    hostname: request.headers.get("host") ?? request.nextUrl.host,
    pathname,
    search,
  });
  if (hostRedirect) {
    return NextResponse.redirect(hostRedirect.location, hostRedirect.status);
  }

  const session = await valid(request.cookies.get(SESSION_COOKIE)?.value);
  const admin = await valid(request.cookies.get(ADMIN_COOKIE)?.value);

  if ((pathname.startsWith("/admin/clients") || pathname.startsWith("/admin/bookings")) && !admin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (pathname === "/admin" && admin) {
    return NextResponse.redirect(new URL("/admin/clients", request.url));
  }
  if (
    (pathname.startsWith("/library") ||
      pathname.startsWith("/hub") ||
      pathname.startsWith("/account") ||
      pathname.startsWith("/scheduling")) &&
    !session
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/shoots") && !session && !admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (session && (pathname === "/" || pathname === "/signup" || pathname === "/signin")) {
    return NextResponse.redirect(new URL(CLIENT_HOME, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/signup",
    "/signin",
    "/forgot-password",
    "/reset-password",
    "/hub",
    "/hub/:path*",
    "/account",
    "/account/:path*",
    "/scheduling",
    "/scheduling/:path*",
    "/library",
    "/library/:path*",
    "/s",
    "/s/:path*",
    "/shoots/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
