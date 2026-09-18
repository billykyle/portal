import type { MetadataRoute } from "next";
import { absoluteBrandIconUrls } from "@/lib/brand-icons";
import { SITE_DESCRIPTION, SITE_NAME, metadataOrigin } from "@/lib/site-metadata";

export default function manifest(): MetadataRoute.Manifest {
  const icons = absoluteBrandIconUrls(metadataOrigin());
  return {
    id: metadataOrigin(),
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: icons.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icons.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icons.icon192Maskable,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: icons.icon512Maskable,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
