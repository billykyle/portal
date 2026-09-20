import assert from "node:assert/strict";
import { test } from "node:test";
import { adminCalendarGapNotice } from "./bookings";

test("adminCalendarGapNotice is only for confirmed bookings missing a Calendar id", () => {
  assert.equal(adminCalendarGapNotice({ status: "confirmed", calendarEventId: null }), "Not on Google Calendar yet.");
  assert.equal(adminCalendarGapNotice({ status: "confirmed" }), "Not on Google Calendar yet.");
  assert.equal(adminCalendarGapNotice({ status: "confirmed", calendarEventId: "evt_1" }), null);
  assert.equal(adminCalendarGapNotice({ status: "cancelled", calendarEventId: null }), null);
});
