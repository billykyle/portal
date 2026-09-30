import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceFieldset } from "./service-fieldset";

test("Commercial video label capitalizes Video and the subtext is Select your hours", () => {
  const html = renderToStaticMarkup(
    createElement(ServiceFieldset, { selected: ["Commercial video"], commercialHours: 4 }),
  );
  assert.match(html, /Commercial Video/);
  assert.match(html, /Select your hours/);
  assert.match(html, /value="Commercial video"/);
  assert.match(html, /value="4"/);
  assert.doesNotMatch(html, /1–8 hours/);
  assert.match(html, /Real Estate/);
  assert.match(html, /Construction/);
  assert.match(html, /Podcast/);
});
