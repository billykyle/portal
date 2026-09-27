import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildShootReminder,
  reminderDateChanged,
  reminderDecision,
  reminderInstant,
  reminderRecipients,
  REMINDER_ACCESS_LINE,
} from "./shoot-reminder";

const zone = "America/New_York";

function at(iso: string) {
  return new Date(iso);
}

const shootTuesday2pm = at("2026-09-29T18:00:00.000Z");
const tuesday6am = at("2026-09-29T10:00:00.000Z");

test("the reminder instant is 6:00am ET on the shoot day, in both DST offsets", () => {
  assert.equal(reminderInstant(shootTuesday2pm, zone).toISOString(), tuesday6am.toISOString());
  const shootJanuary2pm = at("2026-01-15T19:00:00.000Z");
  assert.equal(reminderInstant(shootJanuary2pm, zone).toISOString(), "2026-01-15T11:00:00.000Z");
  assert.equal(reminderDateChanged(shootTuesday2pm, at("2026-09-29T20:00:00.000Z")), false);
  assert.equal(reminderDateChanged(shootTuesday2pm, at("2026-09-30T18:00:00.000Z")), true);
});

test("reminders wait until 6:00am ET on the shoot day, catch up later that morning, and skip short-notice bookings", () => {
  const bookedSunday = {
    status: "confirmed",
    startsAt: shootTuesday2pm,
    createdAt: at("2026-09-27T15:00:00.000Z"),
    reminderSentAt: null,
  };
  assert.equal(reminderDecision(bookedSunday, at("2026-09-29T09:59:00.000Z")), "wait");
  assert.equal(reminderDecision(bookedSunday, tuesday6am), "send");
  assert.equal(reminderDecision(bookedSunday, at("2026-09-29T14:00:00.000Z")), "send");
  assert.equal(
    reminderDecision({ ...bookedSunday, reminderSentAt: tuesday6am }, at("2026-09-29T14:00:00.000Z")),
    "skip",
  );
  assert.equal(reminderDecision(bookedSunday, shootTuesday2pm), "skip");
  assert.equal(reminderDecision({ ...bookedSunday, status: "cancelled" }, tuesday6am), "skip");

  const bookedMondayNight = {
    status: "confirmed",
    startsAt: at("2026-09-29T12:00:00.000Z"),
    createdAt: at("2026-09-29T02:00:00.000Z"),
    reminderSentAt: null,
  };
  assert.equal(reminderDecision(bookedMondayNight, tuesday6am), "skip");

  const bookedWithLead = {
    status: "confirmed",
    startsAt: shootTuesday2pm,
    createdAt: at("2026-09-29T06:00:00.000Z"),
    reminderSentAt: null,
  };
  assert.equal(reminderDecision(bookedWithLead, tuesday6am), "send");
  assert.equal(
    reminderDecision(
      { ...bookedWithLead, createdAt: at("2026-09-29T06:00:01.000Z") },
      tuesday6am,
    ),
    "skip",
  );
});

test("reminder recipients are the client and notes addresses, never notify or placeholders", () => {
  const recipients = reminderRecipients(
    {
      clientEmail: "sam.preview@example.com",
      primaryEmail: "owner@pending.local",
      loginEmails: ["sam.preview@example.com"],
      notes: "Lockbox with alex@example.com and billy@billyhere.com",
    },
    "billy@billyhere.com",
  );
  assert.deepEqual(recipients, ["sam.preview@example.com", "alex@example.com"]);

  const fromLogin = reminderRecipients(
    {
      clientEmail: "guest@pending.local",
      primaryEmail: "firm@pending.local",
      loginEmails: ["teammate@example.com"],
      notes: "cc teammate@example.com",
    },
    "billy@billyhere.com",
  );
  assert.deepEqual(fromLogin, ["teammate@example.com"]);
});

test("the reminder is a threaded reply with the address, access line, and manage links", () => {
  const message = buildShootReminder({
    bookingId: "booking-1",
    address: "12 Wood View Drive",
    services: ["Real Estate · Photography"],
    start: shootTuesday2pm,
    end: at("2026-09-29T19:00:00.000Z"),
    timeZone: zone,
    notes: "Lockbox 4481",
    thread: {
      inReplyTo: "<booking-booking-1@portal.billy-kyle.com>",
      references: "<booking-booking-1@portal.billy-kyle.com>",
      originalSubject: "Shoot confirmed — Tuesday, Sep 29 · 2:00 PM – 3:00 PM",
    },
  });
  assert.match(message.subject, /^Re: Shoot confirmed/);
  assert.match(message.text, /12 Wood View Drive/);
  assert.match(message.text, new RegExp(REMINDER_ACCESS_LINE));
  assert.match(message.text, /Lockbox 4481/);
  assert.match(message.text, /\/scheduling\?modify=booking-1/);
  assert.match(message.text, /\/scheduling\/confirmed\/booking-1/);
  assert.match(message.html, /12 Wood View Drive/);
  assert.match(message.html, /bgcolor="#000000"/);
  assert.match(message.html, /bgcolor="#ffffff"/);
  assert.match(message.html, /email-action-stack/);
  assert.match(message.html, />Modify</);
  assert.match(message.html, />Cancel</);
  assert.doesNotMatch(message.html, /Modify<\/a>&nbsp;&nbsp;<a/);
  assert.equal(message.html.includes("billy@billyhere.com"), false);
  assert.equal(message.headers?.["In-Reply-To"], "<booking-booking-1@portal.billy-kyle.com>");

  const fresh = buildShootReminder({
    bookingId: "booking-2",
    address: "53 Stanwyck Road",
    services: ["Photography"],
    start: shootTuesday2pm,
    end: at("2026-09-29T19:00:00.000Z"),
    timeZone: zone,
  });
  assert.match(fresh.subject, /^Shoot reminder — /);
  assert.equal(fresh.headers, undefined);
});
