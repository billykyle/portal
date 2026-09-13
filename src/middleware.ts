import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { SESSION_COOKIE } from "@/lib/auth";

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
  const { pathname } = request.nextUrl;
  const session = await valid(request.cookies.get(SESSION_COOKIE)?.value);
  const admin = await valid(request.cookies.get(ADMIN_COOKIE)?.value);

  if (pathname.startsWith("/admin/clients") && !admin) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (pathname === "/admin" && admin) {
    return NextResponse.redirect(new URL("/admin/clients", request.url));
  }
  if (pathname.startsWith("/library") && !session) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname.startsWith("/shoots") && !session && !admin) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (session && (pathname === "/" || pathname === "/signup" || pathname === "/signin")) {
    return NextResponse.redirect(new URL("/library", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/signup", "/signin", "/library/:path*", "/shoots/:path*", "/admin/:path*"],
};
