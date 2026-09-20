import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  bookingConfirmationRecipients,
  buildBookingConfirmation,
  buildBookingNotify,
  sendBookingConfirmation,
} from "./booking-email";

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

test("Billy's copy uses a New booking subject and names the client", () => {
  const message = buildBookingNotify({
    clientEmail: "sam@example.com",
    clientName: "Sam Lepore",
    address: "12 Wood View Drive, Princeton, NJ",
    services: ["Real Estate · Photography"],
    start,
    end,
    timeZone: "America/New_York",
  });
  assert.match(message.subject, /^New booking:/);
  assert.match(message.text, /New booking on the portal/);
  assert.match(message.text, /Sam Lepore · sam@example.com/);
  assert.match(message.text, /12 Wood View Drive, Princeton, NJ/);
  assert.match(message.text, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
  assert.match(message.html, /sam@example.com/);
  assert.match(message.html, /https:\/\/admin\.billy-kyle\.com\/admin\/bookings/);
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
    assert.match(String(notify.subject), /^New booking:/);
    assert.match(String(client.text), /is confirmed/);
    assert.match(String(notify.text), /New booking on the portal/);
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
