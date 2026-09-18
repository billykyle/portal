import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BRAND_ICON_FILES } from "./brand-icons";

/** MD5 of the create-next-app / Vercel triangle shipped as src/app/favicon.ico. */
const NEXT_DEFAULT_FAVICON_MD5 = "c30c7d42707a47a3f4591831641e50dc";

function pngSignature(bytes: Buffer) {
  return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

test("favicon.ico is the BK mark, not the Next.js / Vercel triangle", () => {
  const bytes = readFileSync(join(process.cwd(), "src/app/favicon.ico"));
  assert.ok(bytes.length > 64, "favicon.ico should be a real multi-size ICO");
  assert.notEqual(createHash("md5").update(bytes).digest("hex"), NEXT_DEFAULT_FAVICON_MD5);
});

test("PWA and Apple icons are committed BK PNGs", () => {
  for (const relative of Object.values(BRAND_ICON_FILES)) {
    const bytes = readFileSync(join(process.cwd(), relative));
    assert.ok(pngSignature(bytes), `${relative} must be a PNG`);
    assert.ok(bytes.length > 200, `${relative} looks empty`);
  }
});
