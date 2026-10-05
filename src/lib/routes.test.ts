import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import nextConfig from "../../next.config";
import {
  ADMIN_HOME,
  CLIENT_HOME,
  adminHomeCachePaths,
  isAdminHomePath,
  isClientHomePath,
  legacyAdminHomeDestination,
  legacyClientHomeDestination,
} from "./routes";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Files allowed to mention the old slug: the redirect itself, and tests that lock it. */
const LEGACY_HUB_FILES = new Set([
  "README.md",
  "next.config.ts",
  "src/middleware.ts",
  "src/lib/routes.ts",
  "src/lib/routes.test.ts",
  "src/lib/hosts.test.ts",
  "src/middleware.test.ts",
  "src/lib/app-nav.test.ts",
]);

function sourceFiles(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx|md|mjs|js|jsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("client home is /home and /hub only maps onto that path", () => {
  assert.equal(CLIENT_HOME, "/home");
  assert.equal(legacyClientHomeDestination("/hub"), "/home");
  assert.equal(legacyClientHomeDestination("/hub/extra"), "/home/extra");
  assert.equal(legacyClientHomeDestination("/hubcap"), null);
  assert.equal(legacyClientHomeDestination("/home"), null);
  assert.equal(legacyClientHomeDestination("/admin/home"), null);
  assert.equal(isClientHomePath("/home"), true);
  assert.equal(isClientHomePath("/home/extra"), true);
  assert.equal(isClientHomePath("/hub"), false);
  assert.equal(isClientHomePath("/admin/home"), false);
  assert.equal(isClientHomePath("/admin/home/clients"), false);
});

test("admin home is /home and /admin/home only maps onto that path", () => {
  assert.equal(ADMIN_HOME, "/home");
  assert.equal(legacyAdminHomeDestination("/admin/home"), "/home");
  assert.equal(legacyAdminHomeDestination("/admin/home/clients"), "/home/clients");
  assert.equal(legacyAdminHomeDestination("/admin/home/nas-sync"), "/home/nas-sync");
  assert.equal(legacyAdminHomeDestination("/admin/homework"), null);
  assert.equal(legacyClientHomeDestination("/admin/home"), null);
  assert.equal(isClientHomePath("/admin/home"), false);
  assert.equal(isClientHomePath("/admin/home/clients"), false);
  assert.equal(isAdminHomePath("/home"), true);
  assert.equal(isAdminHomePath("/home/clients"), true);
  assert.equal(isAdminHomePath("/homeward"), false);
  assert.equal(isAdminHomePath("/admin/home"), false);
  assert.deepEqual(adminHomeCachePaths(), ["/home", "/admin/home"]);
  assert.deepEqual(adminHomeCachePaths("/home/queue"), ["/home/queue", "/admin/home/queue"]);
  assert.deepEqual(adminHomeCachePaths("/admin/home/book"), ["/home/book", "/admin/home/book"]);
});

test("next config permanently redirects the old client home slug", async () => {
  if (!nextConfig.redirects) throw new Error("next config is missing redirects");
  const redirects = await nextConfig.redirects();
  assert.deepEqual(
    redirects.filter((entry) => entry.source === "/hub" || entry.source === "/hub/:path*"),
    [
      { source: "/hub", destination: "/home", permanent: true },
      { source: "/hub/:path*", destination: "/home/:path*", permanent: true },
    ],
  );
});

test("no client link still points at /hub", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (LEGACY_HUB_FILES.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes("/hub")) hits.push(rel);
  }
  assert.deepEqual(hits, []);
});
