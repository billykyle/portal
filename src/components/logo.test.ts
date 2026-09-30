import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BkMark } from "./logo";

function pngChunkTypes(path: string) {
  const data = readFileSync(path);
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const types: string[] = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("latin1");
    types.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return types;
}

test("the page mark is the transparent monogram svg", () => {
  const header = renderToStaticMarkup(createElement(BkMark));
  const splash = renderToStaticMarkup(createElement(BkMark, { size: "splash" }));
  const black = renderToStaticMarkup(createElement(BkMark, { variant: "black", title: "Billy Kyle" }));
  const pinned = readFileSync("public/brand/safari-pinned-tab.svg", "utf8");
  const paths = [...pinned.matchAll(/d="([^"]+)"/g)].map((match) => match[1]!);

  assert.match(header, /<svg[^>]*viewBox="0 0 1000 1000"/);
  assert.match(header, /role="img"/);
  assert.match(header, /aria-label="Billy Kyle"/);
  assert.match(header, /h-11 w-auto max-h-11/);
  assert.match(header, /fill="#fff"/);
  assert.doesNotMatch(header, /bk-logo|<img/);
  for (const path of paths) assert.match(header, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(splash, /w-\[188px\]/);
  assert.match(splash, /lg:w-\[220px\]/);
  assert.match(black, /fill="#000"/);
  assert.doesNotMatch(black, /<rect/);
});

test("kept logo pngs no longer carry an iCCP profile or XMP", () => {
  for (const path of ["public/brand/bk-logo-white.png", "public/brand/bk-logo.png"]) {
    const types = pngChunkTypes(path);
    assert.equal(types[0], "IHDR");
    assert.equal(types.at(-1), "IEND");
    assert.ok(types.includes("IDAT"));
    assert.equal(types.includes("iCCP"), false);
    assert.equal(types.includes("iTXt"), false);
    assert.equal(types.includes("tEXt"), false);
    assert.equal(types.includes("zTXt"), false);
  }
});
