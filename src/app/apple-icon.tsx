import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND_ICON_FILES } from "@/lib/brand-icons";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const body = await readFile(join(process.cwd(), BRAND_ICON_FILES["180"]));
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}
