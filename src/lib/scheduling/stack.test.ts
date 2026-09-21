import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TIMEZONE, STACK_STRONG_DRIVE_SECONDS } from "./rules";
import {
  compareStackedSlots,
  isStrongStackScore,
  pickSameDayLocatedNexts,
  pickSameDayLocatedPriors,
  pickSuggestedDate,
  scoreSlotStack,
  sortSlotsByStack,
} from "./stack";
import { zonedDateTimeToUtc } from "./zoned-time";

const PHILLY = "1500 Market Street, Philadelphia, PA";
const SHORE = "100 1st Avenue, Avalon, NJ";
const CHERRY_HILL = "1950 Route 70 East, Suite 300, Cherry Hill, NJ";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("strong stack is a short drive, not any same-day job", () => {
  assert.equal(isStrongStackScore(10 * 60), true);
  assert.equal(isStrongStackScore(STACK_STRONG_DRIVE_SECONDS), true);
  assert.equal(isStrongStackScore(STACK_STRONG_DRIVE_SECONDS + 1), false);
  assert.equal(isStrongStackScore(null), false);
});

test("same-day located prior ignores other days and location-less events", () => {
  const slotStart = et(2026, 9, 25, 13);
  const priors = pickSameDayLocatedPriors(
    [
      { start: et(2026, 9, 24, 9), end: et(2026, 9, 24, 10), address: CHERRY_HILL },
      { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 10), address: null },
      { start: et(2026, 9, 25, 10), end: et(2026, 9, 25, 11), address: PHILLY },
      { start: et(2026, 9, 25, 11), end: et(2026, 9, 25, 12), address: SHORE },
    ],
    slotStart,
    "2026-09-25",
    DEFAULT_TIMEZONE,
  );
  assert.equal(priors.length, 1);
  assert.equal(priors[0]?.address, SHORE);
});

test("same-day located next is the earliest located job after the slot", () => {
  const nexts = pickSameDayLocatedNexts(
    [
      { start: et(2026, 9, 25, 15), end: et(2026, 9, 25, 16), address: null },
      { start: et(2026, 9, 25, 16), end: et(2026, 9, 25, 17), address: PHILLY },
      { start: et(2026, 9, 25, 17), end: et(2026, 9, 25, 18), address: SHORE },
      { start: et(2026, 9, 28, 10), end: et(2026, 9, 28, 11), address: CHERRY_HILL },
    ],
    et(2026, 9, 25, 13),
    "2026-09-25",
    DEFAULT_TIMEZONE,
  );
  assert.equal(nexts.length, 1);
  assert.equal(nexts[0]?.address, PHILLY);
});

test("slot score is the better of the immediate before/after located drives", () => {
  const measured = new Map<string, number | null>([
    [`${PHILLY}\n${CHERRY_HILL}`, 40 * 60],
    [`${CHERRY_HILL}\n${SHORE}`, 90 * 60],
  ]);
  const score = scoreSlotStack({
    start: et(2026, 9, 25, 13),
    end: et(2026, 9, 25, 13, 15),
    dateKey: "2026-09-25",
    shootAddress: CHERRY_HILL,
    jobs: [
      { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 10), address: PHILLY },
      { start: et(2026, 9, 25, 16), end: et(2026, 9, 25, 17), address: SHORE },
    ],
    timeZone: DEFAULT_TIMEZONE,
    measured,
  });
  assert.equal(score, 40 * 60);
});

test("same-address same-day work scores 0 without a measured drive", () => {
  const score = scoreSlotStack({
    start: et(2026, 9, 25, 13),
    end: et(2026, 9, 25, 13, 15),
    dateKey: "2026-09-25",
    shootAddress: CHERRY_HILL,
    jobs: [{ start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 10), address: CHERRY_HILL }],
    timeZone: DEFAULT_TIMEZONE,
    measured: new Map(),
  });
  assert.equal(score, 0);
});

test("no same-day located events means no stack score", () => {
  const score = scoreSlotStack({
    start: et(2026, 9, 25, 13),
    end: et(2026, 9, 25, 13, 15),
    dateKey: "2026-09-25",
    shootAddress: CHERRY_HILL,
    jobs: [
      { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 10), address: null },
      { start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10), address: PHILLY },
    ],
    timeZone: DEFAULT_TIMEZONE,
    measured: new Map(),
  });
  assert.equal(score, null);
});

test("sort puts nearer-route times first, then clock time", () => {
  const sorted = sortSlotsByStack([
    { start: "2026-09-25T14:00:00.000Z", end: "2026-09-25T14:15:00.000Z", dateKey: "2026-09-25", stackDriveSeconds: 40 * 60 },
    { start: "2026-09-25T18:00:00.000Z", end: "2026-09-25T18:15:00.000Z", dateKey: "2026-09-25", stackDriveSeconds: 10 * 60 },
    { start: "2026-09-25T19:00:00.000Z", end: "2026-09-25T19:15:00.000Z", dateKey: "2026-09-25", stackDriveSeconds: 10 * 60 },
    { start: "2026-09-23T14:00:00.000Z", end: "2026-09-23T14:15:00.000Z", dateKey: "2026-09-23", stackDriveSeconds: null },
  ]);
  assert.deepEqual(
    sorted.map((slot) => slot.start),
    [
      "2026-09-23T14:00:00.000Z",
      "2026-09-25T18:00:00.000Z",
      "2026-09-25T19:00:00.000Z",
      "2026-09-25T14:00:00.000Z",
    ],
  );
  assert.ok(compareStackedSlots(sorted[1]!, sorted[2]!) < 0);
});

test("suggestedDate prefers the soonest strong-stack day", () => {
  assert.equal(
    pickSuggestedDate([
      { start: "a", end: "a", dateKey: "2026-09-21", stackDriveSeconds: null },
      { start: "b", end: "b", dateKey: "2026-09-25", stackDriveSeconds: 10 * 60 },
      { start: "c", end: "c", dateKey: "2026-09-23", stackDriveSeconds: 20 * 60 },
    ]),
    "2026-09-23",
  );
});

test("suggestedDate falls back to the soonest day with any slot", () => {
  assert.equal(
    pickSuggestedDate([
      { start: "a", end: "a", dateKey: "2026-09-21", stackDriveSeconds: null },
      { start: "b", end: "b", dateKey: "2026-09-25", stackDriveSeconds: 90 * 60 },
    ]),
    "2026-09-21",
  );
  assert.equal(pickSuggestedDate([]), null);
});
