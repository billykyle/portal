import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { bookingConfirmationRecipients, buildBookingConfirmation, sendBookingConfirmation } from "./booking-email";

const EMAIL_ENV = ["RESEND_API_KEY", "EMAIL_FROM", "BOOKING_NOTIFY_EMAIL"] as const;

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

test("booking confirmation recipients go to the client and BCC Billy", () => {
  delete process.env.BOOKING_NOTIFY_EMAIL;
  assert.deepEqual(bookingConfirmationRecipients("sam@example.com"), {
    to: ["sam@example.com"],
    bcc: ["billy@billyhere.com"],
  });
});

test("booking confirmation does not BCC the client when they are Billy", () => {
  delete process.env.BOOKING_NOTIFY_EMAIL;
  assert.deepEqual(bookingConfirmationRecipients("Billy@BillyHere.com"), {
    to: ["billy@billyhere.com"],
    bcc: [],
  });
});

test("BOOKING_NOTIFY_EMAIL overrides Billy's copy address", () => {
  process.env.BOOKING_NOTIFY_EMAIL = "studio@example.com";
  assert.deepEqual(bookingConfirmationRecipients("sam@example.com"), {
    to: ["sam@example.com"],
    bcc: ["studio@example.com"],
  });
});

test("confirmation body is confirmed, Eastern time, and includes optional notes", () => {
  const message = buildBookingConfirmation({
    clientEmail: "sam@example.com",
    clientName: "Sam Lepore",
    address: "12 Wood View Drive, Princeton, NJ",
    services: ["Real Estate · Photography", "Construction · Video"],
    start,
    end,
    timeZone: "America/New_York",
    notes: "Park in the driveway.",
    accessCodes: "Gate 4455",
  });

  assert.match(message.subject, /Shoot confirmed/);
  assert.match(message.subject, /Tue/);
  assert.match(message.text, /Hi Sam Lepore,/);
  assert.match(message.text, /is confirmed/);
  assert.match(message.text, /America\/New_York/);
  assert.match(message.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(message.text, /Real Estate · Photography, Construction · Video/);
  assert.match(message.text, /Park in the driveway\./);
  assert.match(message.text, /Gate 4455/);
  assert.match(message.html, /background:#ffffff/);
  assert.match(message.html, /color:#000000/);
  assert.match(message.html, /12 Wood View Drive, Princeton, NJ/);
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
  assert.deepEqual(result, { sent: false, reason: "resend-unconfigured" });
});

test("sendBookingConfirmation emails the client and BCCs Billy after Resend is set", async () => {
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.EMAIL_FROM;
  delete process.env.BOOKING_NOTIFY_EMAIL;

  const calls: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendBookingConfirmation({
      clientEmail: "sam@example.com",
      clientName: "Sam Lepore",
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography"],
      start,
      end,
      timeZone: "America/New_York",
    });
    assert.deepEqual(result, { sent: true });
    assert.equal(calls.length, 1);
    const body = calls[0] as { from: string; to: string[]; bcc: string[]; subject: string; text: string };
    assert.equal(body.from, "Billy Kyle <billy@billyhere.com>");
    assert.deepEqual(body.to, ["sam@example.com"]);
    assert.deepEqual(body.bcc, ["billy@billyhere.com"]);
    assert.match(body.subject, /Shoot confirmed/);
    assert.match(body.text, /is confirmed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
