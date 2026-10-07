import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { shootOverlapWarning } from "./admin-time";
import {
  adminQueuedScheduleWindow,
  isAdminQueuedSchedule,
  modifyUsesExactWindow,
  queuedScheduleOverlapWarning,
} from "./queued-schedule";

test("only an admin or agent save of a queued shoot skips the slot grid", () => {
  assert.equal(isAdminQueuedSchedule({ fromAdmin: true, status: "queued" }), true);
  assert.equal(isAdminQueuedSchedule({ fromAdmin: false, status: "queued" }), false);
  assert.equal(isAdminQueuedSchedule({ fromAdmin: true, status: "confirmed" }), false);
});

test("agent override uses an exact window for confirmed bookings; clients and admin confirmed modify do not", () => {
  assert.equal(modifyUsesExactWindow({ scheduleOverride: true, fromAdmin: true, status: "confirmed" }), true);
  assert.equal(modifyUsesExactWindow({ scheduleOverride: true, fromAdmin: true, status: "queued" }), true);
  assert.equal(modifyUsesExactWindow({ fromAdmin: true, status: "queued" }), true);
  assert.equal(modifyUsesExactWindow({ fromAdmin: true, status: "confirmed" }), false);
  assert.equal(modifyUsesExactWindow({ scheduleOverride: false, fromAdmin: false, status: "confirmed" }), false);
  assert.equal(modifyUsesExactWindow({ fromAdmin: false, status: "queued" }), false);
});

test("1:15pm stays free when the only confirmed booking is the morning shoot", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "2026-10-13T13:15:00-04:00",
    services: ["Real Estate · Photography"],
  });
  assert.equal(window.ok, true);
  if (!window.ok) return;
  assert.equal(window.start.toISOString(), "2026-10-13T17:15:00.000Z");
  assert.equal(window.end.getTime() - window.start.getTime(), 45 * 60 * 1000);
  // Matt Curcio 9–12 does not overlap 1:15. A Personal "Laura In Office" block
  // is calendar free/busy, not a confirmed booking, so it is not an input.
  assert.equal(
    queuedScheduleOverlapWarning(window, [
      {
        start: new Date("2026-10-13T09:00:00-04:00"),
        end: new Date("2026-10-13T12:00:00-04:00"),
      },
    ]),
    null,
  );
});

test("an overlapping confirmed booking warns with the create_booking message", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "2026-10-13T13:15:00-04:00",
    services: ["Real Estate · Photography"],
  });
  assert.equal(window.ok, true);
  if (!window.ok) return;
  const overlap = {
    start: new Date("2026-10-13T13:00:00-04:00"),
    end: new Date("2026-10-13T14:00:00-04:00"),
  };
  assert.equal(queuedScheduleOverlapWarning(window, [overlap]), "Overlaps an existing booking.");
  assert.equal(queuedScheduleOverlapWarning(window, [overlap]), shootOverlapWarning(window, [overlap]));
  assert.equal(
    queuedScheduleOverlapWarning(window, [
      {
        start: new Date("2026-10-13T12:00:00-04:00"),
        end: new Date("2026-10-13T13:15:00-04:00"),
      },
    ]),
    null,
  );
});

test("the queued save warns on portal bookings and does not read calendar free/busy", () => {
  const source = readFileSync(new URL("./booking-commit.ts", import.meta.url), "utf8");
  const start = source.lastIndexOf("modifyUsesExactWindow");
  const end = source.indexOf("} else if (isPastAdminBookingStart");
  const branch = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(branch, /queuedScheduleOverlapWarning/);
  assert.doesNotMatch(branch, /offerSlotsForAddress|loadLiveAvailabilitySources|fetchCalendarBusy|That time overlaps another event/);
  assert.match(source, /offeredSlotForSubmission/);
  assert.match(source, /if \(!input\.scheduleOverride\)/);
});

test("an unreadable start is rejected before any overlap warning", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "not-a-time",
    services: ["Real Estate · Photography"],
  });
  assert.deepEqual(window, { ok: false, error: "Could not read that time." });
});
