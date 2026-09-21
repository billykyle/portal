import assert from "node:assert/strict";
import { test } from "node:test";
import { initialExpandedDate, initialWeekStart } from "./times-focus";

test("times accordion opens the server suggestedDate when the user is not modifying", () => {
  assert.equal(
    initialExpandedDate({
      suggestedDate: "2026-09-25",
      datesWithSlots: ["2026-09-21", "2026-09-25"],
    }),
    "2026-09-25",
  );
});

test("modify keeps the current booking day expanded even if another day stacks better", () => {
  assert.equal(
    initialExpandedDate({
      suggestedDate: "2026-09-25",
      currentDateKey: "2026-09-21",
      datesWithSlots: ["2026-09-21", "2026-09-25"],
    }),
    "2026-09-21",
  );
});

test("missing suggestedDate opens the soonest day that has a slot", () => {
  assert.equal(
    initialExpandedDate({
      suggestedDate: null,
      datesWithSlots: ["2026-09-25", "2026-09-21"],
    }),
    "2026-09-21",
  );
});

test("week start stays on the first bookable week when the focus day is in it", () => {
  assert.equal(
    initialWeekStart({
      expandedDate: "2026-09-25",
      firstBookableDate: "2026-09-20",
      lastBookableDate: "2026-12-20",
    }),
    "2026-09-20",
  );
});

test("week start jumps to a suggested date further out so that day is on screen", () => {
  assert.equal(
    initialWeekStart({
      expandedDate: "2026-10-09",
      firstBookableDate: "2026-09-20",
      lastBookableDate: "2026-12-20",
    }),
    "2026-10-09",
  );
});
