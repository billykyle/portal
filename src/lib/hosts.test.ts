import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_ADMIN_ORIGIN,
  DEFAULT_PORTAL_ORIGIN,
  adminOrigin,
  adminUrl,
  hostnameOf,
  isAdminHostname,
  isAdminPath,
  isClientPortalPath,
  isLocalHostname,
  isPortalHostname,
  portalOrigin,
  publicPortalOrigin,
  resolveHostRedirect,
} from "./hosts";

const HOST_ENV = ["PORTAL_PUBLIC_URL", "ADMIN_PUBLIC_URL"] as const;

function snapshot() {
  return Object.fromEntries(HOST_ENV.map((key) => [key, process.env[key]]));
}

function restore(previous: Record<string, string | undefined>) {
  for (const key of HOST_ENV) {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

const previous = snapshot();
afterEach(() => restore(previous));

test("portalOrigin defaults to loopback and strips a trailing slash", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(portalOrigin(), "http://127.0.0.1:43173");
  process.env.PORTAL_PUBLIC_URL = "https://portal.billy-kyle.com/";
  assert.equal(portalOrigin(), "https://portal.billy-kyle.com");
});

test("adminOrigin defaults to the locked admin host", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  assert.equal(adminOrigin(), DEFAULT_ADMIN_ORIGIN);
  assert.equal(adminUrl("/admin/bookings"), "https://admin.billy-kyle.com/admin/bookings");
  process.env.ADMIN_PUBLIC_URL = "https://admin.billy-kyle.com/";
  assert.equal(adminOrigin(), "https://admin.billy-kyle.com");
});

test("hostnameOf reads Host headers and absolute origins", () => {
  assert.equal(hostnameOf("portal.billy-kyle.com"), "portal.billy-kyle.com");
  assert.equal(hostnameOf("Portal.Billy-Kyle.com:443"), "portal.billy-kyle.com");
  assert.equal(hostnameOf("https://admin.billy-kyle.com/admin"), "admin.billy-kyle.com");
});

test("local hostnames never count as portal or admin", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(isLocalHostname("127.0.0.1"), true);
  assert.equal(isAdminHostname("127.0.0.1"), false);
  assert.equal(isPortalHostname("127.0.0.1"), false);
  assert.equal(isAdminHostname("localhost"), false);
  process.env.ADMIN_PUBLIC_URL = "http://127.0.0.1:43173";
  assert.equal(isAdminHostname("127.0.0.1"), false);
});

test("production portal and Vercel aliases are portal hosts", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  delete process.env.ADMIN_PUBLIC_URL;
  assert.equal(isPortalHostname("portal.billy-kyle.com"), true);
  assert.equal(isPortalHostname("www.portal.billy-kyle.com"), true);
  assert.equal(isPortalHostname("billy-kyle-client-portal-git-main-team.vercel.app"), true);
  assert.equal(isPortalHostname("admin.billy-kyle.com"), false);
});

test("ADMIN_PUBLIC_URL host is admin, not portal", () => {
  process.env.ADMIN_PUBLIC_URL = "https://admin-git-preview-team.vercel.app";
  assert.equal(isAdminHostname("admin-git-preview-team.vercel.app"), true);
  assert.equal(isPortalHostname("admin-git-preview-team.vercel.app"), false);
  assert.equal(isPortalHostname("other-git-preview-team.vercel.app"), true);
});

test("admin and client path helpers", () => {
  assert.equal(isAdminPath("/admin"), true);
  assert.equal(isAdminPath("/admin/clients"), true);
  assert.equal(isAdminPath("/administration"), false);
  assert.equal(isClientPortalPath("/hub"), true);
  assert.equal(isClientPortalPath("/library"), true);
  assert.equal(isClientPortalPath("/account"), true);
  assert.equal(isClientPortalPath("/scheduling/times"), true);
  assert.equal(isClientPortalPath("/s/token"), true);
  assert.equal(isClientPortalPath("/shoots/abc"), false);
  assert.equal(isClientPortalPath("/admin"), false);
});

test("portal /admin redirects to the admin host and keeps path + query", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  delete process.env.PORTAL_PUBLIC_URL;
  assert.deepEqual(resolveHostRedirect({ hostname: "portal.billy-kyle.com", pathname: "/admin" }), {
    location: "https://admin.billy-kyle.com/admin",
    status: 308,
  });
  assert.deepEqual(
    resolveHostRedirect({
      hostname: "portal.billy-kyle.com",
      pathname: "/admin/clients/c1",
      search: "?minted=BK00002",
    }),
    {
      location: "https://admin.billy-kyle.com/admin/clients/c1?minted=BK00002",
      status: 308,
    },
  );
  assert.deepEqual(
    resolveHostRedirect({
      hostname: "billy-kyle-portal-git-feat-team.vercel.app",
      pathname: "/admin/bookings",
    }),
    {
      location: "https://admin.billy-kyle.com/admin/bookings",
      status: 308,
    },
  );
});

test("admin host root goes to /admin; client paths go to the portal host", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  process.env.PORTAL_PUBLIC_URL = "https://portal.billy-kyle.com";
  assert.deepEqual(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/" }), {
    location: "https://admin.billy-kyle.com/admin",
    status: 308,
  });
  assert.deepEqual(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/library" }), {
    location: "https://portal.billy-kyle.com/library",
    status: 308,
  });
  assert.deepEqual(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/hub" }), {
    location: "https://portal.billy-kyle.com/hub",
    status: 308,
  });
  assert.deepEqual(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/account" }), {
    location: "https://portal.billy-kyle.com/account",
    status: 308,
  });
  assert.equal(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/admin" }), null);
  assert.equal(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/admin/clients" }), null);
  assert.equal(resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/shoots/abc" }), null);
});

test("localhost /admin is left alone so next dev still works", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(resolveHostRedirect({ hostname: "127.0.0.1", pathname: "/admin" }), null);
  assert.equal(resolveHostRedirect({ hostname: "localhost", pathname: "/" }), null);
});

test("publicPortalOrigin never uses loopback for cross-host redirects", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(publicPortalOrigin(), DEFAULT_PORTAL_ORIGIN);
  process.env.PORTAL_PUBLIC_URL = "http://127.0.0.1:43173";
  assert.equal(publicPortalOrigin(), DEFAULT_PORTAL_ORIGIN);
});

test("agent connector stays on whichever host received it", () => {
  delete process.env.ADMIN_PUBLIC_URL;
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(
    resolveHostRedirect({ hostname: "portal.billy-kyle.com", pathname: "/api/agent/mcp" }),
    null,
  );
  assert.equal(
    resolveHostRedirect({ hostname: "admin.billy-kyle.com", pathname: "/api/agent/mcp" }),
    null,
  );
  assert.equal(resolveHostRedirect({ hostname: "127.0.0.1:43173", pathname: "/api/agent/mcp" }), null);
});
