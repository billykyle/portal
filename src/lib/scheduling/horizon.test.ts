import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingHorizonDays,
  dateIsBookable,
  firstBookableDate,
  formatWeekDayListLabel,
  hoursForNow,
  lastBookableDate,
  monthGrid,
  weekDateKeys,
} from "./horizon";
import {
  DEFAULT_MAX_BOOKING_MONTHS,
  DEFAULT_OPEN_HOUR,
  DEFAULT_STEP_MINUTES,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEK_DAYS,
} from "./rules";
import { addCalendarMonths, calendarDateKey, zonedDateTimeToUtc } from "./zoned-time";
import type { SchedulingHours } from "./config";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

const HOURS: SchedulingHours = {
  timeZone: DEFAULT_TIMEZONE,
  openHour: 9,
  closeHour: 18,
  slotMinutes: 90,
  stepMinutes: 15,
  daysAhead: 14,
  minLeadMinutes: 120,
};

test("first bookable day is today when a slot still fits after lead time", () => {
  const first = firstBookableDate(et(2026, 9, 20, 9), HOURS);
  assert.deepEqual(first, { year: 2026, month: 9, day: 20 });
});

test("first bookable day rolls to tomorrow when lead time passes the last slot", () => {
  const first = firstBookableDate(et(2026, 9, 20, 17), HOURS);
  assert.deepEqual(first, { year: 2026, month: 9, day: 21 });
});

test("last bookable day is 3 calendar months from today", () => {
  const now = et(2026, 9, 20, 9);
  assert.deepEqual(lastBookableDate(now, DEFAULT_TIMEZONE), { year: 2026, month: 12, day: 20 });
  assert.equal(DEFAULT_MAX_BOOKING_MONTHS, 3);
});

test("week view is 7 consecutive days starting at the first bookable day", () => {
  const week = weekDateKeys({ year: 2026, month: 9, day: 20 }, { year: 2026, month: 12, day: 20 });
  assert.equal(week.length, DEFAULT_WEEK_DAYS);
  assert.deepEqual(week, [
    "2026-09-20",
    "2026-09-21",
    "2026-09-22",
    "2026-09-23",
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
  ]);
});

test("week view clips to the last bookable day", () => {
  const week = weekDateKeys({ year: 2026, month: 12, day: 18 }, { year: 2026, month: 12, day: 20 });
  assert.deepEqual(week, ["2026-12-18", "2026-12-19", "2026-12-20"]);
});

test("dates after 3 months are not bookable", () => {
  const first = { year: 2026, month: 9, day: 20 };
  const last = { year: 2026, month: 12, day: 20 };
  assert.equal(dateIsBookable({ year: 2026, month: 12, day: 20 }, first, last), true);
  assert.equal(dateIsBookable({ year: 2026, month: 12, day: 21 }, first, last), false);
  assert.equal(dateIsBookable({ year: 2026, month: 9, day: 19 }, first, last), false);
});

test("hoursForNow extends daysAhead to cover the 3-month horizon", () => {
  const now = et(2026, 9, 20, 9);
  const hours = hoursForNow(now);
  assert.ok(hours.daysAhead >= bookingHorizonDays(now, DEFAULT_TIMEZONE));
  assert.ok(hours.daysAhead >= 90);
  assert.equal(DEFAULT_OPEN_HOUR, 9);
  assert.equal(DEFAULT_STEP_MINUTES, 15);
  assert.equal(hours.openHour, 9);
  assert.equal(hours.stepMinutes, 15);
  assert.equal(hours.closeHour, 18);
});

test("addCalendarMonths clamps the day when the target month is shorter", () => {
  assert.deepEqual(addCalendarMonths({ year: 2026, month: 1, day: 31 }, 1), {
    year: 2026,
    month: 2,
    day: 28,
  });
});

test("September 2026 month grid starts on Tuesday", () => {
  const cells = monthGrid(2026, 9);
  assert.equal(cells[0], null);
  assert.equal(cells[1], null);
  assert.deepEqual(cells[2], { year: 2026, month: 9, day: 1 });
  assert.equal(calendarDateKey({ year: 2026, month: 9, day: 20 }), "2026-09-20");
});

test("week day list marks days with zero slots as no time available", () => {
  assert.equal(formatWeekDayListLabel("Sunday, Sep 20", true), "Sunday, Sep 20");
  assert.equal(formatWeekDayListLabel("Monday, Sep 21", false), "Monday, Sep 21 - no time available");
});
