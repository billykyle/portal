import assert from "node:assert/strict";
import { test } from "node:test";
import { filterShoots } from "./shoot-search";

const shoots = [
  { id: "newer", address: "12 Wood View Drive", shotDate: "2026-09-04", dateLabel: "Sep 4, 2026" },
  { id: "older", address: "Whitfield Lane", shotDate: "2025-03-18", dateLabel: "Mar 18, 2025" },
];

test("returns every shoot in the same order when the query is empty", () => {
  assert.deepEqual(
    filterShoots(shoots, "   ").map((shoot) => shoot.id),
    ["newer", "older"],
  );
});

test("matches address text without changing newest-first order", () => {
  const mixed = [
    { id: "a", address: "Main Street", shotDate: "2026-01-02", dateLabel: "Jan 2, 2026" },
    { id: "b", address: "Oak Main", shotDate: "2025-12-01", dateLabel: "Dec 1, 2025" },
    { id: "c", address: "Cedar", shotDate: "2025-06-01", dateLabel: "Jun 1, 2025" },
  ];
  assert.deepEqual(
    filterShoots(mixed, "main").map((shoot) => shoot.id),
    ["a", "b"],
  );
});

test("matches the formatted date users see and typed date fragments", () => {
  assert.equal(filterShoots(shoots, "sep 4").map((shoot) => shoot.id).join(), "newer");
  assert.equal(filterShoots(shoots, "September").map((shoot) => shoot.id).join(), "newer");
  assert.equal(filterShoots(shoots, "2026-09-04").map((shoot) => shoot.id).join(), "newer");
  assert.equal(filterShoots(shoots, "9/4/2026").map((shoot) => shoot.id).join(), "newer");
  assert.equal(filterShoots(shoots, "mar 2025").map((shoot) => shoot.id).join(), "older");
});

test("requires every token so address plus date can be combined", () => {
  assert.equal(filterShoots(shoots, "wood 2026").map((shoot) => shoot.id).join(), "newer");
  assert.deepEqual(filterShoots(shoots, "wood 2025"), []);
});
