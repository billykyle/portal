import type { Metadata } from "next";

export const SITE_NAME = "Billy Kyle";
export const SITE_TITLE = "Client Portal — Billy Kyle";
export const SITE_DESCRIPTION = "Private file delivery for Atmos Imagery / Billy Kyle clients.";

export const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: SITE_NAME,
} as const;

/** Absolute origin for og:image and canonical URLs. Production is the default so crawlers never see localhost. */
export function metadataOrigin() {
  return (process.env.PORTAL_PUBLIC_URL ?? "https://portal.billy-kyle.com").replace(/\/+$/, "");
}

export function shootShareTitle(address: string) {
  const trimmed = address.trim();
  return trimmed ? `${trimmed} — ${SITE_NAME}` : SITE_TITLE;
}

export function shootShareDescription(dateLabel: string) {
  const date = dateLabel.trim();
  return date
    ? `${date}. Photos from Billy Kyle / Atmos Imagery.`
    : "Photos from Billy Kyle / Atmos Imagery.";
}

export function siteMetadata(): Metadata {
  const origin = metadataOrigin();
  return {
    metadataBase: new URL(origin),
    title: {
      default: SITE_TITLE,
      template: `%s — ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: "black",
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [OG_IMAGE],
    },
  };
}

export function shootPageMetadata(input: {
  address: string;
  dateLabel: string;
  url?: string;
}): Metadata {
  const title = input.address.trim() || SITE_NAME;
  const description = shootShareDescription(input.dateLabel);
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: input.url,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}
