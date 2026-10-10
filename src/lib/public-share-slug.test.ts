import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyPublicLink } from "@/components/copy-public-link";
import { ShootActions } from "@/components/shoot-actions";
import { publicShootUrl } from "@/lib/public-link";
import {
  choosePublicShareSlug,
  formatPublicSlugBackfill,
  matchPublicShare,
  planPublicShareSlugs,
  publicShareRedirect,
  publicSlugMatchesTitle,
  slugifyPublicShare,
} from "./public-share-slug";

test("shoot names become readable slugs and keep capitalization", () => {
  assert.equal(slugifyPublicShare("520 N Rose Lane"), "520-N-Rose-Lane");
  assert.equal(slugifyPublicShare("  520   N Rose Lane  "), "520-N-Rose-Lane");
  assert.equal(slugifyPublicShare("Tom & Jerry's"), "Tom-Jerrys");
  assert.equal(slugifyPublicShare("Café Norte"), "Café-Norte");
  assert.equal(slugifyPublicShare("Hello---World"), "Hello-World");
  assert.equal(slugifyPublicShare("---"), "shoot");
  assert.equal(slugifyPublicShare("!!!"), "shoot");
});

test("shared shoot names collide as -2 and -3, case-insensitively", () => {
  const taken = new Set<string>();
  const first = choosePublicShareSlug("520 N Rose Lane", taken);
  taken.add(first);
  const second = choosePublicShareSlug("520 N Rose Lane", taken);
  taken.add(second);
  const third = choosePublicShareSlug("520 n rose lane", taken);
  const other = choosePublicShareSlug("Unit 2", taken);
  assert.equal(first, "520-N-Rose-Lane");
  assert.equal(second, "520-N-Rose-Lane-2");
  assert.equal(third, "520-n-rose-lane-3");
  assert.equal(other, "Unit-2");
  assert.equal(publicSlugMatchesTitle(first, "520 N Rose Lane"), true);
  assert.equal(publicSlugMatchesTitle(second, "520 N Rose Lane"), true);
  assert.equal(publicSlugMatchesTitle(third, "520 n rose lane"), true);
  assert.equal(publicSlugMatchesTitle(first, "16 Cove Road"), false);
  assert.equal(publicSlugMatchesTitle("Unit-2", "Unit 2"), true);
});

test("backfill keeps earlier shoots and records name collisions", () => {
  const plan = planPublicShareSlugs([
    { id: "older", address: "520 N Rose Lane", publicSlug: null },
    { id: "newer", address: "520 N Rose Lane", publicSlug: null },
    { id: "kept", address: "16 Cove Road", publicSlug: "16-Cove-Road" },
    { id: "unit", address: "Unit 2", publicSlug: null },
  ]);
  assert.deepEqual(
    plan.map((row) => [row.id, row.slug, row.assigned, row.collision]),
    [
      ["older", "520-N-Rose-Lane", true, false],
      ["newer", "520-N-Rose-Lane-2", true, true],
      ["kept", "16-Cove-Road", false, false],
      ["unit", "Unit-2", true, false],
    ],
  );
  const report = formatPublicSlugBackfill({
    assigned: plan
      .filter((row) => row.assigned)
      .map((row) => ({
        shootId: row.id,
        address: row.address,
        slug: row.slug,
        collision: row.collision,
      })),
    alreadySet: 1,
  });
  assert.match(report, /Backfilled 3 public shoot slugs/);
  assert.match(report, /520 N Rose Lane -> \/s\/520-N-Rose-Lane-2/);
  assert.doesNotMatch(report, /Unit 2 ->/);
});

test("lookup is case-insensitive and old tokens and renamed slugs redirect 308", () => {
  const rows = [
    {
      id: "rose",
      publicToken: "mOLoADxrEtNfn8uOyMow_gHm",
      publicSlug: "520-N-Rose-Lane-Rear",
    },
    {
      id: "other",
      publicToken: "other-token",
      publicSlug: "16-Cove-Road",
    },
  ];
  const aliases = [{ slug: "520-N-Rose-Lane", shootId: "rose" }];

  const exact = matchPublicShare("520-N-Rose-Lane-Rear", rows, aliases);
  assert.equal(exact?.via, "slug");
  assert.equal(
    publicShareRedirect({
      key: "520-N-Rose-Lane-Rear",
      canonicalSlug: "520-N-Rose-Lane-Rear",
      via: "slug",
    }),
    null,
  );

  const folded = matchPublicShare("520-n-rose-lane-rear", rows, aliases);
  assert.equal(folded?.shoot.id, "rose");
  assert.equal(folded?.via, "slug");
  assert.deepEqual(
    publicShareRedirect({
      key: "520-n-rose-lane-rear",
      canonicalSlug: folded!.shoot.publicSlug,
      via: "slug",
    }),
    { pathname: "/s/520-N-Rose-Lane-Rear", status: 308 },
  );

  const renamed = matchPublicShare("520-n-rose-lane", rows, aliases);
  assert.equal(renamed?.via, "alias");
  assert.equal(renamed?.shoot.id, "rose");
  assert.deepEqual(
    publicShareRedirect({
      key: "520-N-Rose-Lane",
      canonicalSlug: "520-N-Rose-Lane-Rear",
      via: "alias",
    }),
    { pathname: "/s/520-N-Rose-Lane-Rear", status: 308 },
  );

  const token = matchPublicShare("mOLoADxrEtNfn8uOyMow_gHm", rows, aliases);
  assert.equal(token?.via, "token");
  assert.equal(token?.shoot.id, "rose");
  assert.deepEqual(
    publicShareRedirect({
      key: "mOLoADxrEtNfn8uOyMow_gHm",
      canonicalSlug: "520-N-Rose-Lane-Rear",
      via: "token",
    }),
    { pathname: "/s/520-N-Rose-Lane-Rear", status: 308 },
  );

  assert.equal(matchPublicShare("missing", rows, aliases), null);
});

test("admin copy link copies the portal public URL", () => {
  const previous = process.env.PORTAL_PUBLIC_URL;
  process.env.PORTAL_PUBLIC_URL = "https://portal.billy-kyle.com/";
  try {
    assert.equal(
      publicShootUrl("520-N-Rose-Lane"),
      "https://portal.billy-kyle.com/s/520-N-Rose-Lane",
    );
    assert.doesNotMatch(publicShootUrl("520-N-Rose-Lane"), /admin\.billy-kyle\.com/);
  } finally {
    if (previous === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previous;
  }

  const portalUrl = "https://portal.billy-kyle.com/s/520-N-Rose-Lane";
  const copied = renderToStaticMarkup(
    createElement(CopyPublicLink, { url: portalUrl, compact: true }),
  );
  assert.match(copied, /data-url="https:\/\/portal\.billy-kyle\.com\/s\/520-N-Rose-Lane"/);
  assert.match(copied, />Copy link</);

  const actions = renderToStaticMarkup(
    createElement(ShootActions, {
      files: [{ url: "/api/media/1", filename: "front.jpg", type: "photo" }],
      folderName: "2026-09-04-520-n-rose-lane",
      shareUrl: portalUrl,
    }),
  );
  assert.match(actions, /data-url="https:\/\/portal\.billy-kyle\.com\/s\/520-N-Rose-Lane"/);

  const copySource = readFileSync("src/components/copy-public-link.tsx", "utf8");
  const actionSource = readFileSync("src/components/shoot-actions.tsx", "utf8");
  assert.doesNotMatch(copySource, /window\.location/);
  assert.doesNotMatch(actionSource, /window\.location/);
  assert.match(readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8"), /publicShootUrl\(shoot\.publicSlug\)/);
  assert.match(readFileSync("src/components/shoot-screen.tsx", "utf8"), /publicShootUrl\(shoot\.publicSlug\)/);
  assert.match(readFileSync("src/lib/public-link.ts", "utf8"), /PORTAL_PUBLIC_URL|portalOrigin/);

  const page = readFileSync("src/app/s/[token]/page.tsx", "utf8");
  assert.match(page, /permanentRedirect/);
  assert.match(page, /publicShootPath\(shoot\.publicSlug\)/);
  assert.match(page, /publicShootUrl\(resolved\.shoot\.publicSlug\)/);
  const middleware = readFileSync("src/middleware.ts", "utf8");
  assert.match(middleware, /redirectPublicShare/);
  assert.match(middleware, /NextResponse\.redirect\(location, 308\)/);
});
