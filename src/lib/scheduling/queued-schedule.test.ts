import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminQueuedScheduleWindow,
  busyWithoutOwnCalendarEvent,
  isAdminQueuedSchedule,
  QUEUED_SCHEDULE_CONFLICT_ERROR,
  queuedScheduleConflictError,
} from "./queued-schedule";

test("only an admin or agent save of a queued shoot skips the slot grid", () => {
  assert.equal(isAdminQueuedSchedule({ fromAdmin: true, status: "queued" }), true);
  assert.equal(isAdminQueuedSchedule({ fromAdmin: false, status: "queued" }), false);
  assert.equal(isAdminQueuedSchedule({ fromAdmin: true, status: "confirmed" }), false);
});

test("a free Tuesday afternoon is accepted when the morning is the only busy block", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "2026-10-13T13:15:00-04:00",
    services: ["Real Estate · Photography"],
  });
  assert.equal(window.ok, true);
  if (!window.ok) return;
  assert.equal(window.start.toISOString(), "2026-10-13T17:15:00.000Z");
  assert.equal(window.end.getTime() - window.start.getTime(), 45 * 60 * 1000);
  assert.equal(
    queuedScheduleConflictError(window, [
      {
        start: new Date("2026-10-13T09:00:00-04:00"),
        end: new Date("2026-10-13T12:00:00-04:00"),
      },
    ]),
    null,
  );
});

test("an overlapping calendar block is rejected and an abutting one is not", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "2026-10-13T13:15:00-04:00",
    services: ["Real Estate · Photography"],
  });
  assert.equal(window.ok, true);
  if (!window.ok) return;
  assert.equal(
    queuedScheduleConflictError(window, [
      {
        start: new Date("2026-10-13T13:00:00-04:00"),
        end: new Date("2026-10-13T14:00:00-04:00"),
      },
    ]),
    QUEUED_SCHEDULE_CONFLICT_ERROR,
  );
  assert.equal(
    queuedScheduleConflictError(window, [
      {
        start: new Date("2026-10-13T12:00:00-04:00"),
        end: new Date("2026-10-13T13:15:00-04:00"),
      },
    ]),
    null,
  );
});

test("this booking's leftover calendar event does not block the new time", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "2026-10-13T13:15:00-04:00",
    services: ["Real Estate · Photography"],
  });
  assert.equal(window.ok, true);
  if (!window.ok) return;
  const own = {
    start: new Date("2026-10-13T13:00:00-04:00"),
    end: new Date("2026-10-13T15:00:00-04:00"),
    eventId: "evt-own",
  };
  const other = {
    start: new Date("2026-10-13T09:00:00-04:00"),
    end: new Date("2026-10-13T12:00:00-04:00"),
    eventId: "evt-other",
  };
  const busy = busyWithoutOwnCalendarEvent([own, other], [own, other], "evt-own");
  assert.equal(queuedScheduleConflictError(window, busy), null);
});

test("an unreadable start is rejected before any calendar check", () => {
  const window = adminQueuedScheduleWindow({
    startIso: "not-a-time",
    services: ["Real Estate · Photography"],
  });
  assert.deepEqual(window, { ok: false, error: "Could not read that time." });
});
