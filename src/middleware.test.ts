import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { SESSION_COOKIE, signSession } from "@/lib/auth";
import { middleware } from "@/middleware";

process.env.JWT_SECRET ??= "middleware-test-secret";

async function adminCookie() {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return `${ADMIN_COOKIE}=${token}`;
}

function request(url: string, cookie?: string) {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

test("admin host sends / and /admin/home to /home with a 308", async () => {
  const root = await middleware(request("https://admin.billy-kyle.com/"));
  assert.equal(root.status, 308);
  assert.equal(root.headers.get("location"), "https://admin.billy-kyle.com/home");

  const legacy = await middleware(request("https://admin.billy-kyle.com/admin/home/clients?q=Radano"));
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.get("location"), "https://admin.billy-kyle.com/home/clients?q=Radano");
});

test("admin host /home renders the admin dashboard and still gates it", async () => {
  const signedOut = await middleware(request("https://admin.billy-kyle.com/home"));
  assert.equal(signedOut.status, 307);
  assert.equal(signedOut.headers.get("location"), "https://admin.billy-kyle.com/admin");
  assert.equal(signedOut.headers.get("x-middleware-rewrite"), null);

  const signedIn = await middleware(request("https://admin.billy-kyle.com/home/nas-sync", await adminCookie()));
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get("x-middleware-rewrite") ?? "", /\/admin\/home\/nas-sync$/);
});

test("portal /home stays the client page and /admin/home leaves for the admin host", async () => {
  const home = await middleware(request("https://portal.billy-kyle.com/home"));
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "https://portal.billy-kyle.com/");
  assert.equal(home.headers.get("x-middleware-rewrite"), null);

  const legacy = await middleware(request("https://portal.billy-kyle.com/admin/home"));
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.get("location"), "https://admin.billy-kyle.com/home");

  const hub = await middleware(request("https://portal.billy-kyle.com/hub"));
  assert.equal(hub.status, 308);
  assert.equal(hub.headers.get("location"), "https://portal.billy-kyle.com/home");
});

test("local next dev keeps client /home and the admin page path", async () => {
  const clientHome = await middleware(request("http://localhost:43173/home"));
  assert.equal(clientHome.status, 307);
  assert.equal(clientHome.headers.get("location"), "http://localhost:43173/");
  assert.equal(clientHome.headers.get("x-middleware-rewrite"), null);

  const adminHome = await middleware(request("http://localhost:43173/admin/home"));
  assert.equal(adminHome.status, 307);
  assert.equal(adminHome.headers.get("location"), "http://localhost:43173/admin");

  const section = await middleware(request("http://localhost:43173/home/clients", await adminCookie()));
  assert.equal(section.status, 200);
  assert.match(section.headers.get("x-middleware-rewrite") ?? "", /\/admin\/home\/clients$/);

  const adminOnly = await middleware(request("http://localhost:43173/home", await adminCookie()));
  assert.equal(adminOnly.status, 200);
  assert.match(adminOnly.headers.get("x-middleware-rewrite") ?? "", /\/admin\/home$/);

  const clientToken = await signSession({
    userId: "user-1",
    email: "demo@example.com",
    clientId: "client-1",
    inviteCode: "BK00001",
  });
  const both = await middleware(
    request("http://localhost:43173/home", `${await adminCookie()}; ${SESSION_COOKIE}=${clientToken}`),
  );
  assert.equal(both.headers.get("x-middleware-rewrite"), null);
  assert.equal(both.status, 200);
});
