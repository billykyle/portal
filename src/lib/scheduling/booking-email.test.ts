import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { BOOKING_EMAIL_LOGO_URL, EMAIL_SIGNATURE_LINKS } from "@/lib/email-brand";
import {
  PEPPER_NOTIFY_CANCELLED,
  PEPPER_NOTIFY_NEW,
  PEPPER_NOTIFY_UPDATED,
  bookingConfirmationRecipients,
  bookingSchedulingUrl,
  bookingShootManageUrl,
  buildBookingCancelled,
  buildBookingCancelledNotify,
  buildBookingConfirmation,
  buildBookingModified,
  buildBookingModifiedNotify,
  buildBookingNotify,
  sendBookingCancellation,
  sendBookingConfirmation,
  sendBookingModification,
  sendBookingSyncIssue,
  buildBookingSyncIssue,
} from "./booking-email";
import { BOOKING_SYNC_ISSUE_SUBJECT } from "./booking-sync";
import { formatBookingWhen } from "./slots";

const EMAIL_ENV = ["RESEND_API_KEY", "EMAIL_FROM", "BOOKING_NOTIFY_EMAIL", "PORTAL_PUBLIC_URL"] as const;

function snapshotEmailEnv() {
  return Object.fromEntries(EMAIL_ENV.map((key) => [key, process.env[key]]));
}

function restoreEmailEnv(previous: Record<string, string | undefined>) {
  for (const key of EMAIL_ENV) {
    if (previous[key] == null) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

const previous = snapshotEmailEnv();
afterEach(() => restoreEmailEnv(previous));

const start = new Date("2026-09-22T14:00:00.000Z");
const end = new Date("2026-09-22T15:30:00.000Z");
const bookingId = "11111111-1111-4111-8111-111111111111";

function sampleInput(overrides: Record<string, unknown> = {}) {
  return {
    bookingId,
    clientEmail: "sam@example.com",
    clientName: "Sam Lepore",
    address: "12 Wood View Drive, Princeton, NJ",
    services: ["Real Estate · Photography", "Construction · Video"],
    start,
    end,
    timeZone: "America/New_York",
    notes: "Park in the driveway.",
    accessCodes: "Gate 4455",
    ...overrides,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertClientHeadingHasNoWhen(html: string, title: string, when: string) {
  assert.doesNotMatch(html, new RegExp(`${escapeRegExp(title)}</h1>\\s*<p[^>]*>${escapeRegExp(when)}`));
  assert.match(html, />When</);
  assert.match(html, new RegExp(escapeRegExp(when)));
}

function assertNotifyHeadingHasNoIntro(html: string, title: string, when: string, intro: string) {
  assertClientHeadingHasNoWhen(html, title, when);
  assert.doesNotMatch(html, new RegExp(`${escapeRegExp(title)}</h1>\\s*<p[^>]*>`));
  assert.doesNotMatch(html, new RegExp(escapeRegExp(intro)));
}

function assertNoCalendarCtas(message: { text: string; html: string; attachments?: unknown }) {
  assert.doesNotMatch(message.text, /Add to calendar/);
  assert.doesNotMatch(message.html, /Add to calendar/);
  assert.doesNotMatch(message.html, /Google Calendar/);
  assert.doesNotMatch(message.text, /Google Calendar/);
  assert.doesNotMatch(message.html, /api\/scheduling\/ics/);
  assert.doesNotMatch(message.text, /api\/scheduling\/ics/);
  assert.equal(message.attachments, undefined);
}

function assertPepperNote(message: { text: string; html: string }, note: string) {
  assert.match(message.text, new RegExp(escapeRegExp(note)));
  const { label, body } = (() => {
    const separator = " - ";
    const index = note.indexOf(separator);
    return { label: note.slice(0, index), body: note.slice(index + separator.length) };
  })();
  assert.match(message.html, new RegExp(escapeRegExp(label)));
  assert.match(message.html, new RegExp(escapeRegExp(body)));
}

function assertOnBrandHtml(html: string) {
  assert.match(html, /background:#ffffff/);
  assert.match(html, /color:#000000/);
  assert.match(html, /SF Pro Text/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /role="presentation"/);
  assert.match(html, new RegExp(BOOKING_EMAIL_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /Georgia|Times/);
  assert.doesNotMatch(html, /Reply to this email/i);
  assert.doesNotMatch(html, /need to change anything/i);
  for (const link of EMAIL_SIGNATURE_LINKS) {
    assert.match(html, new RegExp(`href="${link.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, new RegExp(`>${link.label}<`));
    assert.doesNotMatch(html, new RegExp(`${link.label}</a>\\s*${link.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
}

test("booking confirmation recipients are two separate To addresses", () => {
  delete process.env.BOOKING_NOTIFY_EMAIL;
  assert.deepEqual(bookingConfirmationRecipients("sam@example.com"), {
    client: "sam@example.com",
    notify: "billy@billyhere.com",
  });
});

test("Billy still gets his own notify address when he is the client", () => {
  delete process.env.BOOKING_NOTIFY_EMAIL;
  assert.deepEqual(bookingConfirmationRecipients("Billy@BillyHere.com"), {
    client: "billy@billyhere.com",
    notify: "billy@billyhere.com",
  });
});

test("BOOKING_NOTIFY_EMAIL overrides Billy's copy address", () => {
  process.env.BOOKING_NOTIFY_EMAIL = "studio@example.com";
  assert.deepEqual(bookingConfirmationRecipients("sam@example.com"), {
    client: "sam@example.com",
    notify: "studio@example.com",
  });
});

test("confirmation body is confirmed, Eastern time, and includes optional notes", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const message = buildBookingConfirmation(sampleInput());

  assert.match(message.subject, /Shoot confirmed/);
  assert.match(message.subject, /Tue/);
  assert.match(message.text, /Hi Sam Lepore,/);
  assert.match(message.text, /is confirmed/);
  assert.match(message.text, /America\/New_York/);
  assert.match(message.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(message.text, /Real Estate · Photography, Construction · Video/);
  assert.match(message.text, /Park in the driveway\./);
  assert.match(message.text, /Gate 4455/);
  assert.match(message.text, /Modify or cancel this shoot/);
  assert.match(message.text, /Add to calendar/);
  assert.match(message.text, /https:\/\/portal\.billy-kyle\.com\/api\/scheduling\/ics\//);
  assert.match(message.text, /https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(message.text, /https:\/\/portal\.billy-kyle\.com\/scheduling\/confirmed\/11111111-1111-4111-8111-111111111111/);
  assert.match(message.html, /Modify or cancel this shoot/);
  assert.match(message.html, /Add to calendar/);
  assert.match(message.html, /Google Calendar/);
  assert.match(message.html, /12 Wood View Drive, Princeton, NJ/);
  assert.equal(message.attachments?.length, 1);
  assert.equal(message.attachments?.[0]?.filename, "2026-09-22-billy-kyle.ics");
  assert.equal(message.attachments?.[0]?.contentType, "text/calendar; charset=utf-8");
  assert.match(Buffer.from(message.attachments?.[0]?.content ?? "", "base64").toString("utf8"), /BEGIN:VCALENDAR/);
  assertClientHeadingHasNoWhen(
    message.html,
    "Shoot confirmed",
    formatBookingWhen(start, end, "America/New_York"),
  );
  assertOnBrandHtml(message.html);
});

test("Billy's copy uses a New shoot subject, no under-title copy, and Pepper instructions", () => {
  const message = buildBookingNotify(sampleInput({ services: ["Real Estate · Photography"] }));
  const when = formatBookingWhen(start, end, "America/New_York");
  assert.match(message.subject, /^New shoot:/);
  assert.match(message.subject, new RegExp(escapeRegExp(when)));
  assert.match(message.html, /<title>New shoot<\/title>/);
  assert.match(message.html, /New shoot<\/h1>/);
  assertNotifyHeadingHasNoIntro(message.html, "New shoot", when, "New shoot on the portal.");
  assert.doesNotMatch(message.text, /New shoot on the portal/);
  assert.match(message.text, /Sam Lepore · sam@example.com/);
  assert.match(message.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(message.text, /View bookings/);
  assert.match(message.text, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assert.match(message.html, /sam@example.com/);
  assert.match(message.html, /View bookings/);
  assert.match(message.html, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assert.doesNotMatch(message.html, /<strong>Admin<\/strong>/);
  assert.doesNotMatch(message.subject, /New booking/);
  assert.doesNotMatch(message.text, /New booking/);
  assert.doesNotMatch(message.html, /New booking/);
  assertPepperNote(message, PEPPER_NOTIFY_NEW);
  assert.match(message.text, new RegExp(`${escapeRegExp(PEPPER_NOTIFY_NEW)}\\n\\n—\\nBilly Kyle`));
  assertNoCalendarCtas(message);
  assertOnBrandHtml(message.html);
});

test("confirmation body omits empty notes and access codes", () => {
  const message = buildBookingConfirmation({
    clientEmail: "sam@example.com",
    address: "12 Wood View Drive",
    services: ["Real Estate · Photography"],
    start,
    end,
    timeZone: "America/New_York",
    notes: "   ",
    accessCodes: null,
  });
  assert.doesNotMatch(message.text, /Notes/);
  assert.doesNotMatch(message.text, /Access codes/);
  assert.doesNotMatch(message.html, /Notes/);
  assert.doesNotMatch(message.html, /Access codes/);
  assert.doesNotMatch(message.text, /Add to calendar/);
  assert.equal(message.attachments, undefined);
});

test("modification emails use updated copy for client and Billy", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const input = sampleInput({
    address: "644 Plumrun Dr, West Chester, PA",
    services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
    notes: "Code 1234",
    accessCodes: null,
  });
  const client = buildBookingModified(input);
  const notify = buildBookingModifiedNotify(input);
  assert.match(client.subject, /Shoot updated/);
  assert.match(client.text, /has been updated/);
  assert.match(client.text, /644 Plumrun Dr/);
  assert.match(client.text, /Code 1234/);
  assert.match(client.text, /Modify or cancel this shoot/);
  assert.match(client.text, /Add to calendar/);
  assert.match(client.html, /Add to calendar/);
  assert.match(client.html, /updated=1/);
  assert.equal(client.attachments?.length, 1);
  assertNoCalendarCtas(notify);
  assertClientHeadingHasNoWhen(
    client.html,
    "Shoot updated",
    formatBookingWhen(start, end, "America/New_York"),
  );
  assertNotifyHeadingHasNoIntro(
    notify.html,
    "Shoot updated",
    formatBookingWhen(start, end, "America/New_York"),
    "A shoot was modified on the portal.",
  );
  assert.match(notify.subject, /^Shoot updated:/);
  assert.doesNotMatch(notify.text, /modified on the portal/);
  assert.match(notify.text, /Sam Lepore · sam@example.com/);
  assert.match(notify.html, /View bookings/);
  assert.match(notify.html, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assertPepperNote(notify, PEPPER_NOTIFY_UPDATED);
  assertOnBrandHtml(client.html);
  assertOnBrandHtml(notify.html);
});

test("client manage URL uses the confirmation page when a booking id is known", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  assert.equal(
    bookingShootManageUrl(bookingId),
    "https://portal.billy-kyle.com/scheduling/confirmed/11111111-1111-4111-8111-111111111111",
  );
  assert.equal(
    bookingShootManageUrl(bookingId, { updated: true }),
    "https://portal.billy-kyle.com/scheduling/confirmed/11111111-1111-4111-8111-111111111111?updated=1",
  );
  assert.equal(bookingShootManageUrl(null), "https://portal.billy-kyle.com/scheduling");
  assert.equal(bookingSchedulingUrl(), "https://portal.billy-kyle.com/scheduling");
});

test("cancellation emails use cancelled copy and link back to Scheduling", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const input = sampleInput();
  const client = buildBookingCancelled(input);
  const notify = buildBookingCancelledNotify(input);

  assert.match(client.subject, /Shoot cancelled/);
  assert.match(client.subject, /Tue/);
  assert.match(client.text, /Hi Sam Lepore,/);
  assert.match(client.text, /appointment with Billy Kyle has been cancelled/);
  assert.match(client.text, /America\/New_York/);
  assert.match(client.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(client.text, /Real Estate · Photography, Construction · Video/);
  assert.match(client.text, /Park in the driveway\./);
  assert.match(client.text, /Gate 4455/);
  assert.match(client.text, /Back to Scheduling/);
  assert.match(client.text, /https:\/\/portal\.billy-kyle\.com\/scheduling$/m);
  assert.doesNotMatch(client.text, /Modify or cancel this shoot/);
  assert.doesNotMatch(client.text, /Add to calendar/);
  assert.doesNotMatch(client.text, /scheduling\/confirmed/);
  assert.doesNotMatch(client.html, /Modify or cancel this shoot/);
  assert.doesNotMatch(client.html, /Add to calendar/);
  assert.doesNotMatch(client.html, /api\/scheduling\/ics/);
  assert.doesNotMatch(client.html, /scheduling\/confirmed/);
  assert.equal(client.attachments, undefined);
  assert.match(client.html, /Back to Scheduling/);
  assert.match(client.html, /https:\/\/portal\.billy-kyle\.com\/scheduling/);
  assertClientHeadingHasNoWhen(
    client.html,
    "Shoot cancelled",
    formatBookingWhen(start, end, "America/New_York"),
  );

  assert.match(notify.subject, /^Shoot cancelled:/);
  assert.match(notify.subject, new RegExp(escapeRegExp(formatBookingWhen(start, end, "America/New_York"))));
  assert.match(notify.html, /<title>Shoot cancelled<\/title>/);
  assert.match(notify.html, /Shoot cancelled<\/h1>/);
  assert.doesNotMatch(notify.subject, /Booking cancelled/);
  assert.doesNotMatch(notify.html, /Booking cancelled/);
  assert.doesNotMatch(notify.text, /Booking cancelled/);
  assert.doesNotMatch(notify.text, /cancelled on the portal/);
  assert.match(notify.text, /Sam Lepore · sam@example.com/);
  assert.match(notify.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(notify.text, /View bookings/);
  assert.match(notify.text, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assert.match(notify.html, /View bookings/);
  assert.match(notify.html, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assertNotifyHeadingHasNoIntro(
    notify.html,
    "Shoot cancelled",
    formatBookingWhen(start, end, "America/New_York"),
    "A booking was cancelled on the portal.",
  );
  assertPepperNote(notify, PEPPER_NOTIFY_CANCELLED);
  assertNoCalendarCtas(notify);
  assertOnBrandHtml(client.html);
  assertOnBrandHtml(notify.html);
});

test("cancellation body omits empty notes and access codes", () => {
  const message = buildBookingCancelled({
    clientEmail: "sam@example.com",
    address: "12 Wood View Drive",
    services: ["Real Estate · Photography"],
    start,
    end,
    timeZone: "America/New_York",
    notes: "   ",
    accessCodes: null,
  });
  assert.doesNotMatch(message.text, /Notes/);
  assert.doesNotMatch(message.text, /Access codes/);
  assert.doesNotMatch(message.html, /Notes/);
  assert.doesNotMatch(message.html, /Access codes/);
});

test("sendBookingConfirmation is a no-op without Resend", async () => {
  delete process.env.RESEND_API_KEY;
  const result = await sendBookingConfirmation({
    clientEmail: "sam@example.com",
    address: "12 Wood View Drive",
    services: ["Real Estate · Photography"],
    start,
    end,
    timeZone: "America/New_York",
  });
  assert.equal(result.sent, false);
  assert.deepEqual(result.client, { sent: false, reason: "resend-unconfigured" });
  assert.deepEqual(result.notify, { sent: false, reason: "resend-unconfigured" });
});

test("sendBookingConfirmation posts two separate Resend emails with no CC/BCC", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.EMAIL_FROM;
  delete process.env.BOOKING_NOTIFY_EMAIL;

  const calls: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendBookingConfirmation({
      bookingId,
      clientEmail: "sam@example.com",
      clientName: "Sam Lepore",
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    });
    assert.equal(result.sent, true);
    assert.equal(result.client.sent, true);
    assert.equal(result.notify.sent, true);
    assert.equal(calls.length, 2);

    const client = calls.find((body) => Array.isArray(body.to) && body.to.includes("sam@example.com"));
    const notify = calls.find((body) => Array.isArray(body.to) && body.to.includes("billy@billyhere.com"));
    assert.ok(client, "expected a client confirmation send");
    assert.ok(notify, "expected a Billy notify send");
    assert.equal(client.from, "Billy Kyle <billy@billyhere.com>");
    assert.equal(notify.from, "Billy Kyle <billy@billyhere.com>");
    assert.deepEqual(client.to, ["sam@example.com"]);
    assert.deepEqual(notify.to, ["billy@billyhere.com"]);
    assert.equal(client.bcc, undefined);
    assert.equal(notify.bcc, undefined);
    assert.equal(client.cc, undefined);
    assert.equal(notify.cc, undefined);
    assert.match(String(client.subject), /Shoot confirmed/);
    assert.match(String(notify.subject), /^New shoot:/);
    assert.match(String(client.text), /is confirmed/);
    assert.doesNotMatch(String(notify.text), /New shoot on the portal/);
    assert.match(String(notify.text), new RegExp(escapeRegExp(PEPPER_NOTIFY_NEW)));
    assert.doesNotMatch(String(notify.text), /Add to calendar/);
    assert.ok(Array.isArray(client.attachments) && client.attachments.length === 1);
    assert.equal(notify.attachments, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendBookingModification posts two separate Resend emails with no CC/BCC", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.EMAIL_FROM;
  delete process.env.BOOKING_NOTIFY_EMAIL;

  const calls: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendBookingModification({
      bookingId,
      clientEmail: "sam@example.com",
      clientName: "Sam Lepore",
      address: "644 Plumrun Dr, West Chester, PA",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    });
    assert.equal(result.sent, true);
    assert.equal(calls.length, 2);
    const client = calls.find((body) => Array.isArray(body.to) && body.to.includes("sam@example.com"));
    const notify = calls.find((body) => Array.isArray(body.to) && body.to.includes("billy@billyhere.com"));
    assert.ok(client, "expected a client modification send");
    assert.ok(notify, "expected a Billy notify send");
    assert.equal(client.from, "Billy Kyle <billy@billyhere.com>");
    assert.equal(notify.from, "Billy Kyle <billy@billyhere.com>");
    assert.deepEqual(client.to, ["sam@example.com"]);
    assert.deepEqual(notify.to, ["billy@billyhere.com"]);
    assert.equal(client.cc, undefined);
    assert.equal(notify.cc, undefined);
    assert.match(String(client.subject), /Shoot updated/);
    assert.match(String(notify.subject), /^Shoot updated:/);
    assert.match(String(notify.text), new RegExp(escapeRegExp(PEPPER_NOTIFY_UPDATED)));
    assert.doesNotMatch(String(notify.text), /Add to calendar/);
    assert.ok(Array.isArray(client.attachments) && client.attachments.length === 1);
    assert.equal(notify.attachments, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendBookingCancellation posts two separate Resend emails with no CC/BCC", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.EMAIL_FROM;
  delete process.env.BOOKING_NOTIFY_EMAIL;
  delete process.env.PORTAL_PUBLIC_URL;

  const calls: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendBookingCancellation({
      clientEmail: "sam@example.com",
      clientName: "Sam Lepore",
      address: "644 Plumrun Dr, West Chester, PA",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    });
    assert.equal(result.sent, true);
    assert.equal(calls.length, 2);
    const client = calls.find((body) => Array.isArray(body.to) && body.to.includes("sam@example.com"));
    const notify = calls.find((body) => Array.isArray(body.to) && body.to.includes("billy@billyhere.com"));
    assert.ok(client, "expected a client cancellation send");
    assert.ok(notify, "expected a Billy notify send");
    assert.equal(client.from, "Billy Kyle <billy@billyhere.com>");
    assert.equal(notify.from, "Billy Kyle <billy@billyhere.com>");
    assert.deepEqual(client.to, ["sam@example.com"]);
    assert.deepEqual(notify.to, ["billy@billyhere.com"]);
    assert.equal(client.cc, undefined);
    assert.equal(notify.cc, undefined);
    assert.equal(client.bcc, undefined);
    assert.equal(notify.bcc, undefined);
    assert.match(String(client.subject), /Shoot cancelled/);
    assert.match(String(notify.subject), /^Shoot cancelled:/);
    assert.match(String(client.text), /has been cancelled/);
    assert.doesNotMatch(String(client.text), /Modify or cancel this shoot/);
    assert.doesNotMatch(String(client.text), /Add to calendar/);
    assert.equal(client.attachments, undefined);
    assert.doesNotMatch(String(notify.text), /cancelled on the portal/);
    assert.match(String(notify.text), new RegExp(escapeRegExp(PEPPER_NOTIFY_CANCELLED)));
    assert.doesNotMatch(String(notify.text), /Add to calendar/);
    assert.equal(notify.attachments, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one failed Resend send does not skip the other", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.BOOKING_NOTIFY_EMAIL;

  let n = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    n += 1;
    const body = JSON.parse(String(init?.body)) as { to: string[] };
    if (body.to.includes("sam@example.com")) {
      return new Response("nope", { status: 500 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendBookingConfirmation({
      clientEmail: "sam@example.com",
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    });
    assert.equal(n, 2);
    assert.equal(result.sent, false);
    assert.deepEqual(result.client, { sent: false, reason: "resend-500" });
    assert.equal(result.notify.sent, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skipNotify sends only the client confirmation", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.BOOKING_NOTIFY_EMAIL;
  const calls: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendBookingConfirmation(sampleInput(), { skipNotify: true });
    assert.equal(result.sent, true);
    assert.equal(result.notify.sent, false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.to, ["sam@example.com"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sync-issue email uses the locked subject and names calendar vs email", () => {
  const message = buildBookingSyncIssue({
    ...sampleInput(),
    action: "create",
    failures: ["calendar"],
  });
  assert.equal(message.subject, BOOKING_SYNC_ISSUE_SUBJECT);
  assert.match(message.text, /Google Calendar sync failed/);
  assert.match(message.text, /Sam Lepore · sam@example.com/);
  assert.match(message.text, /12 Wood View Drive, Princeton, NJ/);
  assert.doesNotMatch(message.text, /Pepper instructions/);
  assert.doesNotMatch(message.text, /automatically entered/);
  assert.doesNotMatch(message.text, /Add to calendar/);
});

test("sendBookingSyncIssue retries the owner notify once", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.BOOKING_NOTIFY_EMAIL;
  let n = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    n += 1;
    if (n === 1) return new Response("nope", { status: 500 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendBookingSyncIssue({
      ...sampleInput(),
      action: "create",
      failures: ["client-email"],
    });
    assert.equal(n, 2);
    assert.equal(result.sent, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
