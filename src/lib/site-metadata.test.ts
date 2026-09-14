import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SITE_NAME,
  metadataOrigin,
  shootPageMetadata,
  shootShareDescription,
  shootShareTitle,
  siteMetadata,
} from "./site-metadata";

test("defaults metadata URLs to the production portal", () => {
  const previous = process.env.PORTAL_PUBLIC_URL;
  try {
    delete process.env.PORTAL_PUBLIC_URL;
    assert.equal(metadataOrigin(), "https://portal.billy-kyle.com");
  } finally {
    if (previous === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previous;
  }
});

test("uses PORTAL_PUBLIC_URL when set and strips a trailing slash", () => {
  const previous = process.env.PORTAL_PUBLIC_URL;
  try {
    process.env.PORTAL_PUBLIC_URL = "https://portal.billy-kyle.com/";
    assert.equal(metadataOrigin(), "https://portal.billy-kyle.com");
  } finally {
    if (previous === undefined) delete process.env.PORTAL_PUBLIC_URL;
    else process.env.PORTAL_PUBLIC_URL = previous;
  }
});

test("names a shared shoot after the address", () => {
  assert.equal(shootShareTitle("12 Wood View Drive"), "12 Wood View Drive — Billy Kyle");
  assert.equal(shootShareTitle("  "), "Client Portal — Billy Kyle");
});

test("describes a shared shoot with the shoot date", () => {
  assert.equal(
    shootShareDescription("Sep 4, 2026"),
    "Sep 4, 2026. Photos from Billy Kyle / Atmos Imagery.",
  );
});

test("site defaults use Billy Kyle — not the Vercel app name", () => {
  const meta = siteMetadata();
  assert.equal(meta.applicationName, SITE_NAME);
  assert.equal(meta.openGraph?.title, SITE_NAME);
  assert.deepEqual(meta.openGraph?.images, [
    { url: "/opengraph-image", width: 1200, height: 630, alt: SITE_NAME },
  ]);
  assert.deepEqual(meta.twitter, {
    card: "summary_large_image",
    title: SITE_NAME,
    description: meta.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: SITE_NAME }],
  });
  assert.equal((meta.appleWebApp as { title?: string }).title, SITE_NAME);
});

test("shoot page metadata keeps the address as the share title", () => {
  const meta = shootPageMetadata({
    address: "12 Wood View Drive",
    dateLabel: "Sep 4, 2026",
    url: "https://portal.billy-kyle.com/s/token",
  });
  assert.equal(meta.title, "12 Wood View Drive");
  assert.equal(meta.openGraph?.title, "12 Wood View Drive");
  assert.equal(meta.openGraph?.url, "https://portal.billy-kyle.com/s/token");
  assert.deepEqual(meta.openGraph?.images, [
    { url: "/opengraph-image", width: 1200, height: 630, alt: "Billy Kyle" },
  ]);
  assert.deepEqual(meta.twitter, {
    card: "summary_large_image",
    title: "12 Wood View Drive",
    description: "Sep 4, 2026. Photos from Billy Kyle / Atmos Imagery.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Billy Kyle" }],
  });
});
