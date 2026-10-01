import assert from "node:assert/strict";
import { test } from "node:test";
import { isPastAdminBookingStart, pastAdminModifyWindow } from "./modify-time";
import { DEFAULT_TIMEZONE } from "./rules";
import { zonedDateTimeToUtc } from "./zoned-time";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("past admin and agent starts use the service length and ignore a mismatched end", () => {
  const now = et(2026, 10, 1, 12);
  const earlierToday = et(2026, 10, 1, 9, 15);
  const earlierDate = et(2024, 3, 6, 10, 30);
  const future = et(2026, 10, 8, 10);
  assert.equal(isPastAdminBookingStart({ fromAdmin: true, start: earlierToday, now }), true);
  assert.equal(isPastAdminBookingStart({ fromAdmin: true, start: earlierDate, now }), true);
  assert.equal(isPastAdminBookingStart({ fromAdmin: true, start: future, now }), false);
  assert.equal(isPastAdminBookingStart({ fromAdmin: false, start: earlierDate, now }), false);
  assert.equal(isPastAdminBookingStart({ fromAdmin: false, start: earlierToday, now }), false);

  const photo = pastAdminModifyWindow({
    start: earlierDate,
    services: ["Real Estate · Photography"],
  });
  assert.ok(photo);
  assert.equal(photo.start.getTime(), earlierDate.getTime());
  assert.equal(photo.end.getTime() - earlierDate.getTime(), 45 * 60 * 1000);

  const stacked = pastAdminModifyWindow({
    start: earlierToday,
    services: ["Construction · Photography", "Real Estate · Video", "Real Estate · Aerial Photos"],
  });
  assert.ok(stacked);
  assert.equal(stacked.end.getTime() - earlierToday.getTime(), (45 + 30 + 15) * 60 * 1000);
});

test("past commercial modify uses the chosen hours", () => {
  const start = et(2024, 3, 6, 9);
  const window = pastAdminModifyWindow({
    start,
    services: ["Commercial video"],
    commercialHours: 3,
  });
  assert.ok(window);
  assert.equal(window.end.getTime() - start.getTime(), 3 * 60 * 60 * 1000);
  assert.equal(pastAdminModifyWindow({ start, services: ["Commercial video"], commercialHours: null }), null);
});
