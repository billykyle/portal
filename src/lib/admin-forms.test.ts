import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SyncNasForm } from "../components/forms/sync-nas-form";

test("admin NAS sync form keeps the button and drops the instructional blurb", () => {
  const html = renderToStaticMarkup(createElement(SyncNasForm));
  assert.match(html, /Sync from NAS/);
  assert.doesNotMatch(html, /source of truth/);
  assert.doesNotMatch(html, /Client Deliverables/);
  assert.doesNotMatch(html, /every 10 minutes/);
});
