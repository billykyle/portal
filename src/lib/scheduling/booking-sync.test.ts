import assert from "node:assert/strict";
import { test } from "node:test";
import { BookingConfirmation } from "../../components/booking-confirmation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BOOKING_SYNC_ALERT_LOG,
  BOOKING_SYNC_ISSUE_SUBJECT,
  adminBookingNotices,
  bookingConfirmationCopy,
  bookingSyncIssueLines,
  bookingSyncNotice,
  describeSyncFailures,
  formatSyncIssue,
  mergeSyncIssue,
  parseSyncIssue,
} from "./booking-sync";
import { settleBookingIntegrations, type BookingIntegrationDeps } from "./booking-integrations";

const start = new Date("2026-09-22T14:00:00.000Z");
const end = new Date("2026-09-22T15:30:00.000Z");
const bookingId = "11111111-1111-4111-8111-111111111111";

test("parse and format sync issue tokens", () => {
  assert.deepEqual(parseSyncIssue(null), { calendar: false, email: false, alertFailed: false });
  assert.deepEqual(parseSyncIssue("calendar+email+alert"), {
    calendar: true,
    email: true,
    alertFailed: true,
  });
  assert.equal(formatSyncIssue({ calendar: true, email: false, alertFailed: false }), "calendar");
  assert.equal(formatSyncIssue({ calendar: true, email: true, alertFailed: true }), "calendar+email+alert");
  assert.equal(formatSyncIssue({ calendar: false, email: false, alertFailed: false }), null);
});

test("mergeSyncIssue prefers stored flags and query-string failures", () => {
  assert.deepEqual(mergeSyncIssue("email", { calendar: "failed" }), {
    calendar: true,
    email: true,
    alertFailed: false,
  });
});

test("full-success confirmation copy stays You're all set", () => {
  const copy = bookingConfirmationCopy({});
  assert.equal(copy.title, "You're all set.");
  assert.equal(copy.subtitle, "Your shoot with Billy Kyle is confirmed.");
  assert.deepEqual(copy.notices, []);
});

test("calendar-fail copy is booked-but-honest and does not claim a calendar event", () => {
  const copy = bookingConfirmationCopy({
    issue: { calendar: true, email: false, alertFailed: false },
    billyNotified: true,
  });
  assert.equal(copy.title, "You're booked.");
  assert.equal(copy.subtitle, "Your shoot is saved.");
  assert.match(copy.notices[0] ?? "", /Calendar sync failed/);
  assert.match(copy.notices[0] ?? "", /Billy has been notified/);
  assert.doesNotMatch(copy.notices[0] ?? "", /on his calendar/);
  assert.doesNotMatch(copy.title, /all set/);
});

test("email-fail copy calls out delivery and the no-alert fallback", () => {
  assert.match(
    bookingSyncNotice({ calendar: false, email: true, billyNotified: true }) ?? "",
    /couldn't send the confirmation email/,
  );
  assert.match(
    bookingSyncNotice({ calendar: true, email: true, billyNotified: false }) ?? "",
    /billy@billyhere.com/,
  );
});

test("admin notices distinguish calendar gap from a failed sync alert", () => {
  assert.deepEqual(adminBookingNotices({ status: "confirmed", calendarEventId: null }), [
    "Not on Google Calendar yet.",
  ]);
  assert.deepEqual(
    adminBookingNotices({ status: "confirmed", calendarEventId: null, syncIssue: "calendar+email+alert" }),
    ["Calendar sync failed.", "Confirmation email failed.", "Billy was not emailed about this sync issue."],
  );
});

test("sync-issue email subject names the failure and includes client when/where", () => {
  const lines = bookingSyncIssueLines({
    action: "create",
    clientName: "Sam Lepore",
    clientEmail: "sam@example.com",
    address: "12 Wood View Drive, Princeton, NJ",
    services: "Real Estate · Photography",
    start,
    end,
    timeZone: "America/New_York",
    failures: ["calendar", "client-email"],
  });
  assert.equal(lines.subject, BOOKING_SYNC_ISSUE_SUBJECT);
  assert.match(lines.intro, /Google Calendar sync and the client confirmation email failed/);
  assert.equal(lines.rows.find((row) => row.label === "Client")?.value, "Sam Lepore · sam@example.com");
  assert.equal(lines.rows.find((row) => row.label === "Where")?.value, "12 Wood View Drive, Princeton, NJ");
  assert.match(describeSyncFailures(["calendar"]), /Google Calendar sync failed/);
});

test("sync-issue copy says a placeholder was not emailed", () => {
  const lines = bookingSyncIssueLines({
    action: "modify",
    clientName: "Justin Heath",
    clientEmail: "justin.heath@pending.local",
    address: "210 McClure Drive, Blue Bell",
    services: "Real Estate · Photography",
    start,
    end,
    timeZone: "America/New_York",
    failures: ["client-email"],
  });
  assert.equal(lines.subject, BOOKING_SYNC_ISSUE_SUBJECT);
  assert.match(lines.intro, /placeholder/);
  assert.match(lines.intro, /not sent/);
  assert.doesNotMatch(lines.intro, /confirmation email failed/);
  assert.equal(
    lines.rows.find((row) => row.label === "Client")?.value,
    "Justin Heath · justin.heath@pending.local",
  );
});

test("settleBookingIntegrations writes calendar, sends New shoot, and skips the alert on full success", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    write: { status: "written", eventId: "evt_1" },
    emails: { sent: true, client: { sent: true }, notify: { sent: true } },
  });
  const result = await settleBookingIntegrations(sampleSettleInput(), deps);
  assert.equal(calls.write, 1);
  assert.equal(calls.notify, 1);
  assert.equal(calls.alert, 0);
  assert.deepEqual(result.issues, { calendar: false, email: false, alertFailed: false });
  assert.equal(result.calendarEventId, "evt_1");
  assert.equal(calls.saved.at(-1), null);
});

test("calendar failure keeps the booking, skips Pepper New shoot, and alerts Billy", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    write: { status: "failed", error: "403" },
    emails: { sent: true, client: { sent: true }, notify: { sent: false, reason: "skipped" } },
    alertSent: true,
  });
  const result = await settleBookingIntegrations(sampleSettleInput(), deps);
  assert.equal(result.issues.calendar, true);
  assert.equal(result.issues.email, false);
  assert.equal(result.billyNotified, true);
  assert.equal(calls.notify, 1);
  assert.equal((deps as { lastSkip?: boolean }).lastSkip, true);
  assert.equal(calls.alert, 1);
  assert.equal(calls.saved.at(-1), "calendar");
});

test("skipOwnerNotify skips New shoot without an owner-email failure", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    write: { status: "written", eventId: "evt_1" },
    emails: { sent: true, client: { sent: true }, notify: { sent: false, reason: "skipped" } },
  });
  const result = await settleBookingIntegrations({ ...sampleSettleInput(), skipOwnerNotify: true }, deps);
  assert.equal(deps.lastSkip, true);
  assert.equal(calls.alert, 0);
  assert.equal(result.issues.email, false);
  assert.equal(result.issues.calendar, false);
  assert.equal(calls.saved.at(-1), null);
});

test("email failure after a good calendar write still alerts Billy", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    write: { status: "written", eventId: "evt_1" },
    emails: { sent: false, client: { sent: false, reason: "resend-500" }, notify: { sent: true } },
    alertSent: true,
  });
  const result = await settleBookingIntegrations(sampleSettleInput(), deps);
  assert.equal(result.issues.email, true);
  assert.equal(result.issues.calendar, false);
  assert.equal(calls.alert, 1);
  assert.equal(calls.saved.at(-1), "email");
});

test("when the owner alert also fails, the booking is flagged and a structured log is written", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const logs: unknown[] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    const deps = mockDeps(calls, {
      write: { status: "failed", error: "403" },
      emails: { sent: false, client: { sent: false, reason: "resend-500" }, notify: { sent: false, reason: "skipped" } },
      alertSent: false,
    });
    const result = await settleBookingIntegrations(sampleSettleInput(), deps);
    assert.equal(result.issues.alertFailed, true);
    assert.equal(calls.saved.at(-1), "calendar+email+alert");
    const first = logs[0] as unknown[] | undefined;
    assert.match(String(first?.[0]), new RegExp(BOOKING_SYNC_ALERT_LOG));
  } finally {
    console.error = previous;
  }
});

test("cancel delete failure is recorded without rolling back the status flip", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    delete: false,
    emails: { sent: true, client: { sent: true }, notify: { sent: true } },
    alertSent: true,
  });
  const result = await settleBookingIntegrations(
    {
      ...sampleSettleInput(),
      action: "cancel",
      deleteCalendarEventId: "evt_1",
      calendarWrite: undefined,
    },
    deps,
  );
  assert.equal(result.issues.calendar, true);
  assert.equal(calls.write, 0);
  assert.equal(calls.notify, 1);
  assert.equal(deps.lastSkip, false, "cancel still sends branded Shoot cancelled emails");
  assert.equal(calls.alert, 1);
});

test("cancel without a calendar event still attempts both cancellation emails", async () => {
  const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
  const deps = mockDeps(calls, {
    emails: { sent: true, client: { sent: true }, notify: { sent: true } },
  });
  const result = await settleBookingIntegrations(
    {
      ...sampleSettleInput(),
      action: "cancel",
      calendarConfigured: false,
      deleteCalendarEventId: null,
      calendarWrite: undefined,
    },
    deps,
  );
  assert.equal(result.issues.calendar, false);
  assert.equal(result.issues.email, false);
  assert.equal(calls.notify, 1);
  assert.equal(deps.lastSkip, false);
  assert.equal(calls.alert, 0);
});

test("client and admin modifies both send the same Shoot changes payload", async () => {
  const previous = {
    address: "12 Wood View Drive, Princeton, NJ",
    services: ["Real Estate · Photography"],
    start,
    end,
    timeZone: "America/New_York",
    notes: "Park in the driveway.",
  };
  const thread = {
    inReplyTo: "<booking-11111111-1111-4111-8111-111111111111@portal.billy-kyle.com>",
    references: "<booking-11111111-1111-4111-8111-111111111111@portal.billy-kyle.com>",
    originalSubject: "Shoot confirmed — Tue, Sep 22 · 10:00 AM – 11:30 AM",
  };

  for (const _actor of ["client", "admin"] as const) {
    const kinds: string[] = [];
    const payloads: Array<{ previous?: unknown; thread?: unknown }> = [];
    const calls = { write: 0, notify: 0, alert: 0, saved: [] as Array<string | null> };
    const deps = mockDeps(calls, {
      write: { status: "written", eventId: "evt_1" },
      emails: { sent: true, client: { sent: true }, notify: { sent: true } },
    });
    const originalSend = deps.sendEmails;
    deps.sendEmails = async (input, options) => {
      kinds.push(options.kind);
      payloads.push({ previous: input.previous, thread: input.thread });
      return originalSend(input, options);
    };

    await settleBookingIntegrations(
      {
        ...sampleSettleInput(),
        action: "modify",
        existingCalendarEventId: "evt_1",
        email: {
          ...sampleSettleInput().email,
          previous,
          thread,
        },
      },
      deps,
    );

    assert.deepEqual(kinds, ["modify"]);
    assert.deepEqual(payloads[0]?.previous, previous);
    assert.deepEqual(payloads[0]?.thread, thread);
    assert.equal(calls.notify, 1);
  }
});

test("confirmation hero renders the calendar-fail alert", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: {
        id: bookingId,
        address: "12 Wood View Drive",
        services: ["Real Estate · Photography"],
        startsAt: start,
        endsAt: end,
        status: "confirmed",
        clientId: "client-1",
      },
      timeZone: "America/New_York",
      clientId: "client-1",
      issue: { calendar: true, email: false, alertFailed: false },
    }),
  );
  assert.match(html, /You(?:'|&#x27;)re booked\./);
  assert.match(html, /Your shoot is saved/);
  assert.match(html, /Calendar sync failed/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re all set/);
});

function sampleSettleInput() {
  return {
    action: "create" as const,
    bookingId,
    calendarConfigured: true,
    calendarWrite: {
      address: "12 Wood View Drive",
      start,
      end,
      timeZone: "America/New_York",
      summary: "Sam - Photo",
    },
    email: {
      bookingId,
      clientEmail: "sam@example.com",
      clientName: "Sam Lepore",
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    },
  };
}

function mockDeps(
  calls: { write: number; notify: number; alert: number; saved: Array<string | null> },
  options: {
    write?: { status: "written"; eventId: string } | { status: "failed"; error: string };
    delete?: boolean;
    emails: { sent: boolean; client: { sent: boolean; reason?: string }; notify: { sent: boolean; reason?: string } };
    alertSent?: boolean;
  },
): BookingIntegrationDeps & { lastSkip?: boolean } {
  const deps: BookingIntegrationDeps & { lastSkip?: boolean } = {
    async writeCalendar() {
      calls.write += 1;
      return options.write ?? { status: "written", eventId: "evt_1" };
    },
    async deleteCalendar() {
      return options.delete ?? true;
    },
    async sendEmails(_input, sendOptions) {
      calls.notify += 1;
      deps.lastSkip = Boolean(sendOptions.skipNotify);
      return {
        sent: options.emails.sent,
        client: options.emails.client.sent
          ? { sent: true as const }
          : { sent: false as const, reason: options.emails.client.reason ?? "failed" },
        notify: options.emails.notify.sent
          ? { sent: true as const }
          : { sent: false as const, reason: options.emails.notify.reason ?? "failed" },
      };
    },
    async sendSyncIssue() {
      calls.alert += 1;
      return { sent: Boolean(options.alertSent) };
    },
    async saveBookingSync(_id, patch) {
      calls.saved.push(patch.syncIssue);
    },
  };
  return deps;
}
