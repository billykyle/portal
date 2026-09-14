import { brandMarkImage } from "@/lib/og-brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return brandMarkImage(size, 118);
}
