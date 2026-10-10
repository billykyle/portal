import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_BOOKING_FLAGS, modifyClientAgentBooking, selectOfferedClientSlot } from "./book";
import type { OfferedSlot } from "@/lib/scheduling/availability";

const slot: OfferedSlot = {
  start: "2026-10-14T14:00:00.000Z",
  end: "2026-10-14T14:45:00.000Z",
  dateKey: "2026-10-14",
  dateLabel: "Wed, Oct 14",
  timeLabel: "10:00–10:45 AM",
  driveSecondsFromPrior: 0,
};

test("client slot selection rejects a time that is not offered and a past start", () => {
  const future = selectOfferedClientSlot({
    slots: [slot],
    startsAt: slot.start,
    now: new Date("2026-10-10T12:00:00.000Z"),
    timeZone: "America/New_York",
  });
  assert.equal(future.ok, true);

  const missing = selectOfferedClientSlot({
    slots: [slot],
    startsAt: "2026-10-13T15:00:00.000Z",
    now: new Date("2026-10-10T12:00:00.000Z"),
    timeZone: "America/New_York",
  });
  assert.equal(missing.ok, false);

  const past = selectOfferedClientSlot({
    slots: [slot],
    startsAt: slot.start,
    now: new Date("2026-10-14T15:00:00.000Z"),
    timeZone: "America/New_York",
  });
  assert.equal(past.ok, false);
  if (past.ok) return;
  assert.match(past.error, /no longer available/);
});

test("modify uses the client grid and the bound client only", async () => {
  assert.equal(CLIENT_BOOKING_FLAGS.fromAdmin, false);
  assert.equal(CLIENT_BOOKING_FLAGS.scheduleOverride, false);
  let prepared = false;
  const missing = await modifyClientAgentBooking(
    {
      clientId: "client-a",
      userId: "user-a",
      email: "a@example.com",
      bookingId: "booking-b",
      notes: "1234",
    },
    {
      async loadBooking(clientId, bookingId) {
        assert.equal(clientId, "client-a");
        assert.equal(bookingId, "booking-b");
        return null;
      },
      prepare: async () => {
        prepared = true;
        throw new Error("should not prepare another client's booking");
      },
      finish: async () => {
        throw new Error("should not finish");
      },
    },
  );
  assert.equal(missing.ok, false);
  assert.equal(prepared, false);

  let flags: { fromAdmin?: boolean; scheduleOverride?: boolean; viaAgent?: boolean; clientId?: string } = {};
  const saved = await modifyClientAgentBooking(
    {
      clientId: "client-a",
      userId: "user-a",
      email: "a@example.com",
      bookingId: "booking-a",
      startsAt: slot.start,
    },
    {
      async loadBooking() {
        return {
          id: "booking-a",
          clientId: "client-a",
          createdByUserId: "user-a",
          address: "10 Oak St",
          service: null,
          services: ["Real Estate · Photography"],
          commercialVideoHours: null,
          startsAt: new Date(slot.start),
          endsAt: new Date(slot.end),
          status: "confirmed",
          notes: null,
          accessCodes: null,
          calendarEventId: null,
          clientEmailMessageId: null,
          clientEmailReferences: null,
          clientEmailSubject: null,
          reminderSentAt: null,
          syncIssue: null,
          driveSecondsFromPrior: null,
          twilightDay: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async prepare(input) {
        flags = {
          fromAdmin: input.fromAdmin,
          scheduleOverride: input.scheduleOverride,
          viaAgent: input.viaAgent,
          clientId: input.session?.clientId,
        };
        return { ok: false, error: "That time is no longer available. Pick another.", stage: "times" };
      },
      finish: async () => {
        throw new Error("should not finish");
      },
    },
  );
  assert.equal(saved.ok, false);
  assert.equal(flags.fromAdmin, false);
  assert.equal(flags.scheduleOverride, false);
  assert.equal(flags.viaAgent, true);
  assert.equal(flags.clientId, "client-a");
});
