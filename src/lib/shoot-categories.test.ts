import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  categoryFolderStartsOpen,
  groupShootsByCategoryFolder,
  parseClosedCategoryFolders,
  serializeClosedCategoryFolders,
} from "./shoot-categories";

test("shoots with no category folder stay a flat list", () => {
  const grouped = groupShootsByCategoryFolder([
    { id: "a", categoryFolder: null },
    { id: "b", categoryFolder: "" },
  ]);
  assert.equal(grouped.grouped, false);
});

test("ungrouped shoots stay first and categories sort A to Z", () => {
  const grouped = groupShootsByCategoryFolder([
    { id: "listing", categoryFolder: "Listing Photography" },
    { id: "root", categoryFolder: null },
    { id: "construction", categoryFolder: "Construction" },
    { id: "listing-2", categoryFolder: "Listing Photography" },
  ]);
  assert.equal(grouped.grouped, true);
  if (!grouped.grouped) return;
  assert.deepEqual(
    grouped.ungrouped.map((shoot) => shoot.id),
    ["root"],
  );
  assert.deepEqual(
    grouped.categories.map((category) => category.name),
    ["Construction", "Listing Photography"],
  );
  assert.deepEqual(
    grouped.categories[1]?.shoots.map((shoot) => shoot.id),
    ["listing", "listing-2"],
  );
});

test("category lists start closed and do not restore a saved open folder", () => {
  const list = readFileSync("src/components/shoot-list.tsx", "utf8");
  const podcast = readFileSync("src/components/templates/podcast-template.tsx", "utf8");
  assert.match(list, /defaultOpen=\{false\}/);
  assert.match(podcast, /defaultOpen=\{false\}/);
  assert.doesNotMatch(list, /categoryFolderStartsOpen/);
  assert.doesNotMatch(podcast, /categoryFolderStartsOpen/);
});

test("closed category folders start closed and the rest start open", () => {
  const stored = serializeClosedCategoryFolders(["Listing Photography"]);
  const closed = parseClosedCategoryFolders(encodeURIComponent(stored));
  assert.equal(categoryFolderStartsOpen(closed, "Listing Photography"), false);
  assert.equal(categoryFolderStartsOpen(closed, "Construction"), true);
  assert.equal(categoryFolderStartsOpen(parseClosedCategoryFolders(null), "Construction"), true);
});
