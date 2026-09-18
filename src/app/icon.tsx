import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SIZES = {
  "32": { width: 32, height: 32, file: "icon-32.png" },
  "192": { width: 192, height: 192, file: "icon-192.png" },
  "512": { width: 512, height: 512, file: "icon-512.png" },
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
  const body = await readFile(join(process.cwd(), "public", "brand", "icons", spec.file));
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}
