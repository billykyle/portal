import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyPublicLink } from "@/components/copy-public-link";
import { ShootActions } from "@/components/shoot-actions";
import { publicShootUrl } from "@/lib/public-link";
import { isReservedClientSlug } from "@/lib/reserved-routes";
import {
  canonicalShareRedirect,
  chooseClientSlug,
  choosePublicShareSlug,
  clientShareLabel,
  clientSlugMatches,
  countClientNameCollisions,
  formatClientSlugBackfill,
  formatPublicSlugBackfill,
  matchClientShare,
  matchLegacyPublicShare,
  matchShootShare,
  planClientShareSlugs,
  planLegacyGlobalSlugs,
  planWithinClientShootSlugs,
  publicSlugMatchesTitle,
  slugifyPublicShare,
} from "./public-share-slug";

const SKIP_APP_FILES = new Set([
  "layout.tsx",
  "template.tsx",
  "loading.tsx",
  "error.tsx",
  "global-error.tsx",
  "not-found.tsx",
  "forbidden.tsx",
  "unauthorized.tsx",
  "default.tsx",
  "page.tsx",
  "route.ts",
  "globals.css",
]);

function topLevelNames(dir: string) {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "." || entry.name === "..") continue;
    if (entry.name.startsWith("[") || entry.name.startsWith("(")) continue;
    if (entry.name.endsWith(".css")) continue;
    if (!entry.isDirectory() && SKIP_APP_FILES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      names.push(entry.name);
      continue;
    }
    if (entry.name === "favicon.ico") {
      names.push("favicon.ico");
      continue;
    }
    names.push(entry.name.replace(/\.(tsx|ts|jsx|js)$/, ""));
  }
  return names;
}

test("shoot names become readable slugs and keep capitalization", () => {
  assert.equal(slugifyPublicShare("520 N Rose Lane"), "520-N-Rose-Lane");
  assert.equal(slugifyPublicShare("  520   N Rose Lane  "), "520-N-Rose-Lane");
  assert.equal(slugifyPublicShare("Tom & Jerry's"), "Tom-Jerrys");
  assert.equal(slugifyPublicShare("Café Norte"), "Café-Norte");
  assert.equal(slugifyPublicShare("Marilyn O'Donoghue"), "Marilyn-ODonoghue");
  assert.equal(slugifyPublicShare("Hello---World"), "Hello-World");
  assert.equal(slugifyPublicShare("---"), "shoot");
  assert.equal(slugifyPublicShare("!!!"), "shoot");
});

test("a client slug uses the display name, then the company, and skips reserved routes", () => {
  assert.equal(clientShareLabel({ displayName: "Lisa Yakulis", company: "Kurfiss Sotheby's" }), "Lisa Yakulis");
  assert.equal(clientShareLabel({ displayName: "  ", company: "Acme Realty" }), "Acme Realty");
  assert.equal(clientShareLabel({ displayName: "", company: "" }), "");
  assert.equal(chooseClientSlug("Lisa Yakulis", new Set()), "Lisa-Yakulis");
  assert.equal(chooseClientSlug("Home", new Set()), "Home-2");
  assert.equal(chooseClientSlug("admin", new Set()), "admin-2");
  assert.equal(chooseClientSlug("s", new Set()), "s-2");
  assert.equal(chooseClientSlug("", new Set()), "client");
  assert.equal(clientSlugMatches("Lisa-Yakulis", "Lisa Yakulis"), true);
  assert.equal(clientSlugMatches("Home", "Home"), false);
  assert.equal(clientSlugMatches("Home-2", "Home"), true);
  assert.equal(clientSlugMatches("Sam-Lepore-2", "Sam Lepore"), true);
});

test("client slugs collide as -2 across clients and ignore case", () => {
  const plan = planClientShareSlugs([
    { id: "older", displayName: "Sam Lepore", company: "Keller Williams", publicSlug: null },
    { id: "newer", displayName: "sam lepore", company: null, publicSlug: null },
    { id: "home", displayName: "Home", company: null, publicSlug: null },
    { id: "company", displayName: "", company: "Acme Realty", publicSlug: null },
    { id: "kept", displayName: "Lisa Yakulis", company: null, publicSlug: "Lisa-Yakulis" },
  ]);
  assert.deepEqual(
    plan.map((row) => [row.id, row.slug, row.assigned, row.nameCollision]),
    [
      ["older", "Sam-Lepore", true, false],
      ["newer", "sam-lepore-2", true, true],
      ["home", "Home-2", true, false],
      ["company", "Acme-Realty", true, false],
      ["kept", "Lisa-Yakulis", false, false],
    ],
  );
  assert.equal(
    countClientNameCollisions([
      { displayName: "Sam Lepore", company: null },
      { displayName: "sam lepore", company: "Other" },
      { displayName: "Lisa Yakulis", company: null },
      { displayName: "Home", company: null },
    ]),
    1,
  );
  assert.match(
    formatClientSlugBackfill({
      assigned: plan.filter((row) => row.assigned).map((row) => ({
        clientId: row.id,
        slug: row.slug,
        nameCollision: row.nameCollision,
      })),
      nameCollisions: 1,
    }),
    /Client-name collisions: 1/,
  );
});

test("reserved client slugs cover every app route and public file", () => {
  for (const name of topLevelNames("src/app")) {
    assert.equal(isReservedClientSlug(name), true, `src/app/${name} is not reserved`);
  }
  for (const name of topLevelNames("public")) {
    assert.equal(isReservedClientSlug(name), true, `public/${name} is not reserved`);
  }
  assert.equal(isReservedClientSlug("LOGIN"), true);
  assert.equal(isReservedClientSlug("_next"), true);
  assert.equal(isReservedClientSlug(".well-known"), true);
  assert.equal(isReservedClientSlug("Lisa-Yakulis"), false);
});

test("shoot slugs collide only inside one client, so a global -2 is dropped", () => {
  const taken = new Set<string>();
  const first = choosePublicShareSlug("April Videos", taken);
  taken.add(first);
  const second = choosePublicShareSlug("april videos", taken);
  assert.equal(first, "April-Videos");
  assert.equal(second, "april-videos-2");
  assert.equal(publicSlugMatchesTitle(second, "april videos"), true);
  assert.equal(publicSlugMatchesTitle(first, "October Videos"), false);

  const plan = planWithinClientShootSlugs([
    { id: "sam-april", clientId: "sam", address: "April Videos", publicSlug: "April-Videos" },
    { id: "mar-april", clientId: "marilyn", address: "April Videos", publicSlug: "April-Videos-2" },
    { id: "mar-oct-old", clientId: "marilyn", address: "October Videos", publicSlug: "October-Videos" },
    { id: "mar-oct-new", clientId: "marilyn", address: "October Videos", publicSlug: "October-Videos-2" },
    { id: "fresh", clientId: "lisa", address: "520 N Rose Lane", publicSlug: null },
  ]);
  assert.deepEqual(
    plan.map((row) => [row.id, row.slug, row.changed, row.collision]),
    [
      ["sam-april", "April-Videos", false, false],
      ["mar-april", "April-Videos", true, false],
      ["mar-oct-old", "October-Videos", false, false],
      ["mar-oct-new", "October-Videos-2", false, true],
      ["fresh", "520-N-Rose-Lane", true, false],
    ],
  );
  assert.match(
    formatPublicSlugBackfill({
      assigned: [{ shootId: "fresh", address: "520 N Rose Lane", slug: "520-N-Rose-Lane", collision: false }],
      recomputed: [{ shootId: "mar-april", address: "April Videos", from: "April-Videos-2", slug: "April-Videos" }],
      alreadySet: 3,
    }),
    /April Videos -> April-Videos \(was April-Videos-2\)/,
  );
});

test("legacy /s slugs are snapshotted before the per-client recompute", () => {
  const legacy = planLegacyGlobalSlugs(
    [
      { id: "sam-april", address: "April Videos", publicSlug: "April-Videos" },
      { id: "mar-april", address: "April Videos", publicSlug: "April-Videos-2" },
      { id: "rose", address: "520 N Rose Lane", publicSlug: "520-N-Rose-Lane" },
      { id: "missing", address: "16 Cove Road", publicSlug: null },
    ],
    [{ slug: "520-N-Rose-Lane", shootId: "rose" }],
  );
  assert.deepEqual(legacy, [
    { slug: "April-Videos", shootId: "sam-april" },
    { slug: "April-Videos-2", shootId: "mar-april" },
    { slug: "16-Cove-Road", shootId: "missing" },
  ]);
});

test("lookup is case-insensitive and old tokens, /s slugs, and renames redirect 308", () => {
  const clients = [
    { id: "lisa", publicSlug: "Lisa-Yakulis" },
    { id: "sam", publicSlug: "Sam-Lepore" },
    { id: "marilyn", publicSlug: "Marilyn-ODonoghue" },
  ];
  const shoots = [
    {
      id: "rose",
      clientId: "lisa",
      publicToken: "mOLoADxrEtNfn8uOyMow_gHm",
      publicSlug: "520-N-Rose-Lane",
    },
    {
      id: "sam-april",
      clientId: "sam",
      publicToken: "sam-token",
      publicSlug: "April-Videos",
    },
    {
      id: "mar-april",
      clientId: "marilyn",
      publicToken: "mar-token",
      publicSlug: "April-Videos",
    },
  ];
  const legacy = [
    { slug: "520-N-Rose-Lane", shootId: "rose" },
    { slug: "April-Videos", shootId: "sam-april" },
    { slug: "April-Videos-2", shootId: "mar-april" },
  ];
  const clientAliases = [{ slug: "Lisa", clientId: "lisa" }];
  const shootAliases = [{ clientId: "lisa", slug: "520-N-Rose-Lane-Rear", shootId: "rose" }];

  assert.equal(matchClientShare("lisa-yakulis", clients, clientAliases)?.client.id, "lisa");
  assert.equal(matchClientShare("LISA", clients, clientAliases)?.via, "alias");
  assert.equal(matchShootShare("lisa", "520-n-rose-lane", shoots, shootAliases)?.via, "slug");
  assert.equal(matchShootShare("lisa", "520-n-rose-lane-rear", shoots, shootAliases)?.shoot.id, "rose");
  assert.equal(matchShootShare("marilyn", "520-N-Rose-Lane", shoots, shootAliases), null);

  assert.equal(
    canonicalShareRedirect({
      clientKey: "Lisa-Yakulis",
      shootKey: "520-N-Rose-Lane",
      clientSlug: "Lisa-Yakulis",
      shootSlug: "520-N-Rose-Lane",
    }),
    null,
  );
  assert.deepEqual(
    canonicalShareRedirect({
      clientKey: "lisa-yakulis",
      shootKey: "520-n-rose-lane",
      clientSlug: "Lisa-Yakulis",
      shootSlug: "520-N-Rose-Lane",
    }),
    { pathname: "/Lisa-Yakulis/520-N-Rose-Lane", status: 308 },
  );
  assert.deepEqual(
    canonicalShareRedirect({
      clientKey: "Lisa",
      shootKey: "520-N-Rose-Lane-Rear",
      clientSlug: "Lisa-Yakulis",
      shootSlug: "520-N-Rose-Lane",
    }),
    { pathname: "/Lisa-Yakulis/520-N-Rose-Lane", status: 308 },
  );

  const oldSlug = matchLegacyPublicShare("April-Videos-2", shoots, clients, legacy);
  assert.equal(oldSlug?.via, "alias");
  assert.equal(oldSlug?.shoot.id, "mar-april");
  assert.equal(oldSlug?.pathname, "/Marilyn-ODonoghue/April-Videos");

  const bare = matchLegacyPublicShare("april-videos", shoots, clients, legacy);
  assert.equal(bare?.shoot.id, "sam-april");
  assert.equal(bare?.pathname, "/Sam-Lepore/April-Videos");

  const token = matchLegacyPublicShare("mOLoADxrEtNfn8uOyMow_gHm", shoots, clients, legacy);
  assert.equal(token?.via, "token");
  assert.equal(token?.shoot.id, "rose");
  assert.equal(token?.pathname, "/Lisa-Yakulis/520-N-Rose-Lane");

  const folded = matchLegacyPublicShare("520-n-rose-lane", shoots, clients, legacy);
  assert.equal(folded?.shoot.id, "rose");
  assert.equal(folded?.pathname, "/Lisa-Yakulis/520-N-Rose-Lane");

  assert.equal(matchLegacyPublicShare("missing", shoots, clients, legacy), null);
});

test("copy link uses PORTAL_PUBLIC_URL and the client/shoot path", () => {
  const previous = process.env.PORTAL_PUBLIC_URL;
  process.env.PORTAL_PUBLIC_URL = "https://portal.billy-kyle.com/";
  try {
    assert.equal(
      publicShootUrl("Lisa-Yakulis", "520-N-Rose-Lane"),
      "https://portal.billy-kyle.com/Lisa-Yakulis/520-N-Rose-Lane",
    );
    assert.doesNotMatch(publicShootUrl("Lisa-Yakulis", "520-N-Rose-Lane"), /\/s\//);
    assert.doesNotMatch(publicShootUrl("Lisa-Yakulis", "520-N-Rose-Lane"), /admin\.billy-kyle\.com/);
  } finally {
    if (previous === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previous;
  }

  const portalUrl = "https://portal.billy-kyle.com/Lisa-Yakulis/520-N-Rose-Lane";
  const copied = renderToStaticMarkup(createElement(CopyPublicLink, { url: portalUrl, compact: true }));
  assert.match(copied, /data-url="https:\/\/portal\.billy-kyle\.com\/Lisa-Yakulis\/520-N-Rose-Lane"/);
  assert.match(copied, />Copy link</);

  const actions = renderToStaticMarkup(
    createElement(ShootActions, {
      files: [{ url: "/api/media/1", filename: "front.jpg", type: "photo" }],
      folderName: "2026-10-08-520-n-rose-lane",
      shareUrl: portalUrl,
    }),
  );
  assert.match(actions, /data-url="https:\/\/portal\.billy-kyle\.com\/Lisa-Yakulis\/520-N-Rose-Lane"/);

  const copySource = readFileSync("src/components/copy-public-link.tsx", "utf8");
  const actionSource = readFileSync("src/components/shoot-actions.tsx", "utf8");
  assert.doesNotMatch(copySource, /window\.location/);
  assert.doesNotMatch(actionSource, /window\.location/);
  assert.match(
    readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8"),
    /publicShootUrl\(client\.publicSlug, shoot\.publicSlug\)/,
  );
  assert.match(readFileSync("src/components/shoot-screen.tsx", "utf8"), /publicShootUrl\(owner\?\.publicSlug/);
  assert.match(readFileSync("src/lib/public-link.ts", "utf8"), /PORTAL_PUBLIC_URL|portalOrigin/);
  assert.match(readFileSync("src/lib/agent/present.ts", "utf8"), /publicShootUrl\(clientSlug, shootSlug\)/);
  assert.match(readFileSync("src/lib/delivery.ts", "utf8"), /publicShootUrl\(input\.client\.publicSlug, input\.shoot\.publicSlug\)/);

  const page = readFileSync("src/app/[clientSlug]/[shootSlug]/page.tsx", "utf8");
  assert.match(page, /permanentRedirect/);
  assert.match(page, /publicShootPath\(resolved\.client\.publicSlug, shoot\.publicSlug\)/);
  assert.match(page, /publicShootUrl\(resolved\.client\.publicSlug, resolved\.shoot\.publicSlug\)/);
  const legacy = readFileSync("src/app/s/[token]/page.tsx", "utf8");
  assert.match(legacy, /permanentRedirect/);
  assert.match(legacy, /getLegacyPublicShoot/);
  const middleware = readFileSync("src/middleware.ts", "utf8");
  assert.match(middleware, /redirectPublicShare/);
  assert.match(middleware, /NextResponse\.redirect\(location, 308\)/);
});
