import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TIMEZONE } from "./rules";
import { utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";
import {
  adminShootWindow,
  formatAdminShootPreview,
  parseAdminShootDate,
  parseAdminShootTime,
  shootOverlapWarning,
} from "./admin-time";

function et(year: number, month: number, day: number, hour: number, minute: number) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("admin time parser accepts forgiving eastern times", () => {
  assert.deepEqual(parseAdminShootTime("10"), { ok: true, hour: 10, minute: 0 });
  assert.deepEqual(parseAdminShootTime("10:30"), { ok: true, hour: 10, minute: 30 });
  assert.deepEqual(parseAdminShootTime("10:30am"), { ok: true, hour: 10, minute: 30 });
  assert.deepEqual(parseAdminShootTime("2pm"), { ok: true, hour: 14, minute: 0 });
  assert.deepEqual(parseAdminShootTime("2:15 PM"), { ok: true, hour: 14, minute: 15 });
  assert.deepEqual(parseAdminShootTime("14:15"), { ok: true, hour: 14, minute: 15 });
  assert.deepEqual(parseAdminShootTime("7"), { ok: true, hour: 19, minute: 0 });
  assert.deepEqual(parseAdminShootTime("7:40"), { ok: true, hour: 19, minute: 40 });
  assert.deepEqual(parseAdminShootTime("7:40pm"), { ok: true, hour: 19, minute: 40 });
  assert.deepEqual(parseAdminShootTime("12"), { ok: true, hour: 0, minute: 0 });
  assert.deepEqual(parseAdminShootTime("12pm"), { ok: true, hour: 12, minute: 0 });
  assert.deepEqual(parseAdminShootTime("8"), { ok: true, hour: 8, minute: 0 });

  assert.equal(parseAdminShootTime("").ok, false);
  assert.equal(parseAdminShootTime("abc").ok, false);
  assert.equal(parseAdminShootTime("25:00").ok, false);
  assert.equal(parseAdminShootTime("14pm").ok, false);
  assert.equal(parseAdminShootTime("7:60").ok, false);
});

test("admin dates reject impossible calendar days", () => {
  assert.deepEqual(parseAdminShootDate("2026-09-25"), { year: 2026, month: 9, day: 25 });
  assert.equal(parseAdminShootDate("2026-02-31"), null);
  assert.equal(parseAdminShootDate("09/25/2026"), null);
});

test("preview labels the eastern start, and overlap is only a real collision", () => {
  const start = et(2026, 9, 25, 10, 30);
  assert.equal(formatAdminShootPreview(start), "Fri, Sep 25 at 10:30 AM");
  const window = adminShootWindow("2026-09-22", "7:40pm", ["Real Estate · Photography"]);
  assert.ok(window);
  assert.equal(utcToZonedParts(window.start, DEFAULT_TIMEZONE).hour, 19);
  assert.equal(utcToZonedParts(window.start, DEFAULT_TIMEZONE).minute, 40);
  assert.equal(window.end.getTime() - window.start.getTime(), 45 * 60 * 1000);
  assert.equal(
    shootOverlapWarning(window, [{ start: et(2026, 9, 22, 18, 0), end: et(2026, 9, 22, 19, 39) }]),
    null,
  );
  assert.equal(
    shootOverlapWarning(window, [{ start: et(2026, 9, 22, 19, 30), end: et(2026, 9, 22, 20, 0) }]),
    "Overlaps an existing booking.",
  );
});
