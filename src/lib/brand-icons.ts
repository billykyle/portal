/** Static BK marks used by favicon, PWA, and Apple home-screen icons. */
export const BRAND_ICON_FILES = {
  "32": "public/brand/icons/icon-32.png",
  "180": "public/brand/icons/apple-touch-icon.png",
  "192": "public/brand/icons/icon-192.png",
  "512": "public/brand/icons/icon-512.png",
} as const;

export const BRAND_ICON_PUBLIC = {
  favicon: "/favicon.ico",
  svg: "/brand/icon.svg",
  icon32: "/brand/icons/icon-32.png",
  icon192: "/brand/icons/icon-192.png",
  icon512: "/brand/icons/icon-512.png",
  icon192Maskable: "/brand/icons/icon-192-maskable.png",
  icon512Maskable: "/brand/icons/icon-512-maskable.png",
  apple: "/brand/icons/apple-touch-icon.png",
  appleTouch: "/apple-touch-icon.png",
  mask: "/brand/safari-pinned-tab.svg",
  manifest: "/manifest.webmanifest",
} as const;

export function absoluteBrandIconUrls(origin: string) {
  const base = origin.replace(/\/+$/, "");
  return {
    favicon: `${base}${BRAND_ICON_PUBLIC.favicon}`,
    svg: `${base}${BRAND_ICON_PUBLIC.svg}`,
    icon32: `${base}${BRAND_ICON_PUBLIC.icon32}`,
    icon192: `${base}${BRAND_ICON_PUBLIC.icon192}`,
    icon512: `${base}${BRAND_ICON_PUBLIC.icon512}`,
    icon192Maskable: `${base}${BRAND_ICON_PUBLIC.icon192Maskable}`,
    icon512Maskable: `${base}${BRAND_ICON_PUBLIC.icon512Maskable}`,
    apple: `${base}${BRAND_ICON_PUBLIC.apple}`,
    appleTouch: `${base}${BRAND_ICON_PUBLIC.appleTouch}`,
    mask: `${base}${BRAND_ICON_PUBLIC.mask}`,
    manifest: `${base}${BRAND_ICON_PUBLIC.manifest}`,
  };
}
