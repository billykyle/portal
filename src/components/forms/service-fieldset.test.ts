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

test("Social Media Video is a dropdown labeled Select all that apply and keeps both choices", () => {
  const monthly = "Social Media Video · Monthly Batch Video";
  const longForm = "Social Media Video · Long Form Content Creation";
  const html = renderToStaticMarkup(
    createElement(ServiceFieldset, { selected: [monthly, longForm] }),
  );
  assert.match(
    html,
    /Social Media Video<\/span><span class="block text-sm text-\[#8e8e93\]">Select all that apply<\/span>/,
  );
  assert.match(html, /aria-label="Social Media Video, Monthly Batch Video, Long Form Content Creation selected"/);
  assert.match(html, /Monthly Batch Video/);
  assert.match(html, /Long Form Content Creation/);
  assert.match(html, new RegExp(`value="${monthly}"`));
  assert.match(html, new RegExp(`value="${longForm}"`));
  const pressed = html.match(/aria-pressed="true"/g) ?? [];
  assert.equal(pressed.length, 2);
});
