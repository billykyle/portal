import { OG_ALT, OG_SIZE, OG_TYPE, brandMarkImage } from "@/lib/og-brand";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function OpenGraphImage() {
  return brandMarkImage(OG_SIZE, 280);
}
