import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const body = await readFile(
    join(process.cwd(), "public", "brand", "icons", "apple-touch-icon.png"),
  );
  return new Response(body, {
    headers: { "Content-Type": contentType },
  });
}
