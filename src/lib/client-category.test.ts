import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
  assert.equal(CLIENT_CATEGORY_LABEL.construction, "Construction");
});

test("category picks a content template", () => {
  assert.equal(templateIdForCategory("real_estate"), "realEstate");
  assert.equal(templateIdForCategory("podcast"), "podcast");
  assert.equal(templateIdForCategory("other"), "default");
  assert.equal(templateIdForCategory("construction"), "default");
});
