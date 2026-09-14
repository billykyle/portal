import { brandMarkImage } from "@/lib/og-brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  return brandMarkImage(size, 22);
}
