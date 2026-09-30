import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditClientForm } from "../components/forms/edit-client-form";
import { MintClientForm } from "../components/forms/mint-client-form";
import { contentTemplate } from "../components/templates/registry";
import {
  CLIENT_CATEGORIES,
  CLIENT_CATEGORY_LABEL,
  NEW_CLIENT_CATEGORY,
  isClientCategory,
  readClientCategory,
  templateIdForCategory,
} from "./client-category";

test("new clients default to other and labels stay readable", () => {
  assert.equal(NEW_CLIENT_CATEGORY, "other");
  assert.equal(readClientCategory(undefined), "other");
  assert.equal(readClientCategory(""), "other");
  assert.equal(readClientCategory("podcast"), "podcast");
  assert.equal(readClientCategory("nope"), null);
  assert.equal(isClientCategory("real_estate"), true);
  assert.equal(isClientCategory("commercial"), true);
  assert.equal(CLIENT_CATEGORY_LABEL.construction, "Construction");
  assert.equal(CLIENT_CATEGORY_LABEL.commercial, "Commercial");
  assert.equal(readClientCategory("commercial"), "commercial");
  assert.deepEqual(CLIENT_CATEGORIES, ["real_estate", "construction", "podcast", "other", "commercial"]);
});

test("category picks a content template", () => {
  assert.equal(templateIdForCategory("real_estate"), "realEstate");
  assert.equal(templateIdForCategory("podcast"), "podcast");
  assert.equal(templateIdForCategory("other"), "default");
  assert.equal(templateIdForCategory("construction"), "default");
  assert.equal(templateIdForCategory("commercial"), "default");
  assert.equal(contentTemplate("commercial"), contentTemplate("other"));
  assert.equal(contentTemplate("commercial"), contentTemplate("construction"));
});

test("create and edit offer Commercial without rewriting stored categories", () => {
  const create = renderToStaticMarkup(createElement(MintClientForm, {}));
  assert.match(create, /<option value="commercial">Commercial<\/option>/);
  assert.match(create, /<option value="other" selected="">Other<\/option>/);

  const edit = renderToStaticMarkup(
    createElement(EditClientForm, {
      client: {
        id: "c1",
        inviteCode: "BK00002",
        displayName: "Sam",
        primaryEmail: "sam@example.com",
        company: null,
        notes: null,
        category: "commercial",
      },
    }),
  );
  assert.match(edit, /<option value="commercial" selected="">Commercial<\/option>/);
  assert.match(edit, /<option value="real_estate">Real Estate<\/option>/);

  const ensure = readFileSync("src/lib/db/ensure.ts", "utf8");
  assert.match(ensure, /ADD VALUE IF NOT EXISTS 'commercial'/);
  assert.doesNotMatch(ensure, /SET category = 'commercial'/);
});
