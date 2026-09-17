import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND_ICON_FILES } from "@/lib/brand-icons";

const SIZES = {
  "32": { width: 32, height: 32, file: BRAND_ICON_FILES["32"] },
  "192": { width: 192, height: 192, file: BRAND_ICON_FILES["192"] },
  "512": { width: 512, height: 512, file: BRAND_ICON_FILES["512"] },
} as const;

export const contentType = "image/png";

export function generateImageMetadata() {
  return Object.entries(SIZES).map(([id, { width, height }]) => ({
    id,
    size: { width, height },
    contentType,
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const resolved = String(await id);
  const key = (resolved in SIZES ? resolved : "192") as keyof typeof SIZES;
  const spec = SIZES[key];
  const body = await readFile(join(process.cwd(), spec.file));
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}
