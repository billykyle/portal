import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceFieldset } from "./service-fieldset";
import { servicesForClientCategory } from "@/lib/scheduling/category-services";

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

test("service groups render in booking order with exclusive hints", () => {
  const html = renderToStaticMarkup(createElement(ServiceFieldset, { selected: [] }));
  const titles = [...html.matchAll(/block text-\[15px\]">([^<]+)/g)].map((match) => match[1]);
  assert.deepEqual(titles, [
    "Real Estate",
    "Social Media Video",
    "Podcast",
    "Construction",
    "Commercial Video",
    "Meeting",
  ]);
  assert.match(
    html,
    /Real Estate<\/span><span class="block text-sm text-\[#8e8e93\]">Select all that apply<\/span>/,
  );
  assert.match(
    html,
    /Construction<\/span><span class="block text-sm text-\[#8e8e93\]">Select all that apply<\/span>/,
  );
  assert.match(
    html,
    /Podcast<\/span><span class="block text-sm text-\[#8e8e93\]">Select one that applies<\/span>/,
  );
  assert.match(
    html,
    /Social Media Video<\/span><span class="block text-sm text-\[#8e8e93\]">Select one that applies<\/span>/,
  );
  assert.match(
    html,
    /Meeting<\/span><span class="block text-sm text-\[#8e8e93\]">Select one that applies<\/span>/,
  );
  assert.match(html, /Select your hours/);
  assert.doesNotMatch(html, /Choose one/);
});

test("Social Media Video and Meeting each keep a single exclusive choice", () => {
  const monthly = "Social Media Video · Monthly Batch Video";
  const longForm = "Social Media Video · Long Form Content Creation";
  const half = "Meeting · 30 min appointment";
  const hour = "Meeting · 1 hour appointment";
  const html = renderToStaticMarkup(
    createElement(ServiceFieldset, { selected: [monthly, longForm, half, hour] }),
  );
  assert.match(html, /aria-label="Social Media Video, Long Form Content Creation selected"/);
  assert.match(html, /aria-label="Meeting, 1 hour appointment selected"/);
  assert.match(html, new RegExp(`value="${longForm}"`));
  assert.match(html, new RegExp(`value="${hour}"`));
  assert.doesNotMatch(html, new RegExp(`value="${monthly}"`));
  assert.doesNotMatch(html, new RegExp(`value="${half}"`));
  assert.match(html, /Monthly Batch Video/);
  assert.match(html, /30 min appointment/);
  const pressed = html.match(/aria-pressed="true"/g) ?? [];
  assert.equal(pressed.length, 2);
});

test("a client category hides the other industries and drops a disallowed selection", () => {
  const html = renderToStaticMarkup(
    createElement(ServiceFieldset, {
      selected: ["Podcast · 1 episode", "Real Estate · Photography", "Commercial video"],
      commercialHours: 3,
      allowedServices: servicesForClientCategory("real_estate"),
    }),
  );
  const titles = [...html.matchAll(/block text-\[15px\]">([^<]+)/g)].map((match) => match[1]);
  assert.deepEqual(titles, ["Real Estate", "Social Media Video", "Meeting"]);
  assert.match(html, /value="Real Estate · Photography"/);
  assert.match(html, /Aerial Photos/);
  assert.match(html, /Zillow 360/);
  assert.match(html, /Exterior Only/);
  const zillow = html.indexOf("Zillow 360");
  const exterior = html.indexOf("Exterior Only");
  assert.ok(zillow >= 0 && exterior > zillow);
  assert.doesNotMatch(html, /Podcast/);
  assert.doesNotMatch(html, /Construction/);
  assert.doesNotMatch(html, /Commercial/);
  assert.doesNotMatch(html, /value="Podcast · 1 episode"/);
  assert.doesNotMatch(html, /value="Commercial video"/);
  assert.doesNotMatch(html, /value="3"/);
});
