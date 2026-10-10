import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_BOOKING_LINE,
  buildBookingCancelled,
  buildBookingConfirmation,
  buildBookingModified,
  buildBookingNotify,
} from "@/lib/scheduling/booking-email";

const input = {
  clientEmail: "sam@example.com",
  clientName: "Sam",
  bookingId: "booking-1",
  address: "10 Oak St",
  services: ["Real Estate · Photography"],
  start: new Date("2026-10-13T14:00:00.000Z"),
  end: new Date("2026-10-13T14:45:00.000Z"),
  timeZone: "America/New_York",
  notes: "lockbox 1234",
};

test("agent bookings add one general line and do not name an agent", () => {
  const plain = buildBookingConfirmation(input);
  assert.equal(plain.text.includes(AGENT_BOOKING_LINE), false);
  const booked = buildBookingConfirmation({ ...input, viaAgent: true });
  const changed = buildBookingModified({ ...input, viaAgent: true });
  const cancelled = buildBookingCancelled({ ...input, viaAgent: true });
  const notify = buildBookingNotify({ ...input, viaAgent: true });
  for (const message of [booked, changed, cancelled, notify]) {
    assert.equal(message.text.includes(AGENT_BOOKING_LINE), true);
    assert.equal(message.html.includes(AGENT_BOOKING_LINE), true);
    assert.equal(/listing assistant|cursor|claude/i.test(message.text), false);
  }
  assert.equal(booked.text.split(AGENT_BOOKING_LINE).length, 2);
});
