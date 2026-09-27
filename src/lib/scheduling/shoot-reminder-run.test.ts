import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverDueReminders, type ReminderCandidate } from "./shoot-reminder-run";

const now = new Date("2026-09-29T10:00:00.000Z");

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    id: "booking-1",
    status: "confirmed",
    startsAt: new Date("2026-09-29T18:00:00.000Z"),
    endsAt: new Date("2026-09-29T19:00:00.000Z"),
    createdAt: new Date("2026-09-27T15:00:00.000Z"),
    reminderSentAt: null,
    address: "12 Wood View Drive",
    services: ["Real Estate · Photography"],
    notes: "Lockbox with alex@example.com and billy@billyhere.com",
    clientEmail: "sam.preview@example.com",
    primaryEmail: "owner@pending.local",
    loginEmails: ["sam.preview@example.com"],
    thread: {
      inReplyTo: "<booking-booking-1@portal.billy-kyle.com>",
      references: "<booking-booking-1@portal.billy-kyle.com>",
      originalSubject: "Shoot confirmed — Tuesday, Sep 29 · 2:00 PM – 3:00 PM",
    },
    ...overrides,
  };
}

test("due reminders claim once, mail the client and notes, and release a total failure", async () => {
  const claimed: string[] = [];
  const released: string[] = [];
  const sentTo: string[] = [];
  const counts = await deliverDueReminders(
    [
      candidate(),
      candidate({
        id: "booking-later",
        startsAt: new Date("2026-09-30T18:00:00.000Z"),
        endsAt: new Date("2026-09-30T19:00:00.000Z"),
      }),
      candidate({ id: "booking-fail", clientEmail: "fail@example.com", notes: null, loginEmails: [], primaryEmail: null }),
    ],
    {
      now,
      timeZone: "America/New_York",
      gapMs: 0,
      async claim(id) {
        claimed.push(id);
        return true;
      },
      async release(id) {
        released.push(id);
      },
      async send(message) {
        sentTo.push(message.to);
        assert.match(message.subject, /^Re: Shoot confirmed/);
        assert.equal(message.headers?.["In-Reply-To"], "<booking-booking-1@portal.billy-kyle.com>");
        return { sent: message.to !== "fail@example.com" };
      },
    },
  );

  assert.deepEqual(sentTo, ["sam.preview@example.com", "alex@example.com", "fail@example.com"]);
  assert.deepEqual(claimed, ["booking-1", "booking-fail"]);
  assert.deepEqual(released, ["booking-fail"]);
  assert.deepEqual(counts, { checked: 3, sent: 1, skipped: 1, failed: 1 });
});
