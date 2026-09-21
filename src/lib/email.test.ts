import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_BOOKING_NOTIFY_EMAIL,
  DEFAULT_EMAIL_FROM,
  bookingNotifyEmail,
  emailConfigured,
  emailFrom,
  sendEmail,
  uniqueEmails,
} from "./email";

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

test("email defaults match locked Billy From / notify addresses", () => {
  assert.equal(DEFAULT_EMAIL_FROM, "Billy Kyle <billy@billyhere.com>");
  assert.equal(DEFAULT_BOOKING_NOTIFY_EMAIL, "billy@billyhere.com");
});

test("emailFrom and bookingNotifyEmail use locked defaults when unset", () => {
  delete process.env.EMAIL_FROM;
  delete process.env.BOOKING_NOTIFY_EMAIL;
  assert.equal(emailFrom(), DEFAULT_EMAIL_FROM);
  assert.equal(bookingNotifyEmail(), DEFAULT_BOOKING_NOTIFY_EMAIL);
});

test("emailFrom and bookingNotifyEmail honor env overrides", () => {
  process.env.EMAIL_FROM = "  Atmos <hello@example.com>  ";
  process.env.BOOKING_NOTIFY_EMAIL = "  studio@example.com  ";
  assert.equal(emailFrom(), "Atmos <hello@example.com>");
  assert.equal(bookingNotifyEmail(), "studio@example.com");
});

test("emailConfigured is true only when RESEND_API_KEY is set", () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(emailConfigured(), false);
  process.env.RESEND_API_KEY = "re_test";
  assert.equal(emailConfigured(), true);
});

test("uniqueEmails lowercases and drops blanks and duplicates", () => {
  assert.deepEqual(uniqueEmails(["Sam@Example.com", " sam@example.com ", "", "billy@billyhere.com"]), [
    "sam@example.com",
    "billy@billyhere.com",
  ]);
});

test("sendEmail is a no-op without RESEND_API_KEY", async () => {
  delete process.env.RESEND_API_KEY;
  const result = await sendEmail({ to: "sam@example.com", subject: "Hi", text: "Hello" });
  assert.deepEqual(result, { sent: false, reason: "resend-unconfigured" });
});

test("sendEmail posts to Resend with From and To only", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_FROM = "Billy Kyle <billy@billyhere.com>";

  const calls: Array<{ url: string; init: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await sendEmail({
      to: "sam@example.com",
      subject: "Shoot confirmed",
      text: "Confirmed.",
    });
    assert.equal(result.sent, true);
    if (result.sent) assert.equal(result.id, "msg_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    const headers = new Headers(calls[0]?.init.headers);
    assert.equal(headers.get("Authorization"), "Bearer re_test");
    const body = JSON.parse(String(calls[0]?.init.body));
    assert.equal(body.from, "Billy Kyle <billy@billyhere.com>");
    assert.deepEqual(body.to, ["sam@example.com"]);
    assert.equal(body.bcc, undefined);
    assert.equal(body.cc, undefined);
    assert.equal(body.subject, "Shoot confirmed");
    assert.equal(body.text, "Confirmed.");
    assert.equal(body.headers, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendEmail posts custom headers and returns the Message-ID", async () => {
  process.env.RESEND_API_KEY = "re_test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.headers, {
      "Message-ID": "<booking-1@portal.billy-kyle.com>",
      "In-Reply-To": "<booking-1@portal.billy-kyle.com>",
    });
    return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendEmail({
      to: "sam@example.com",
      subject: "Shoot changes",
      text: "Changed.",
      headers: {
        "Message-ID": "<booking-1@portal.billy-kyle.com>",
        "In-Reply-To": "<booking-1@portal.billy-kyle.com>",
      },
    });
    assert.deepEqual(result, {
      sent: true,
      id: "re_123",
      messageId: "<booking-1@portal.billy-kyle.com>",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendEmail soft-fails when Resend returns an error", async () => {
  process.env.RESEND_API_KEY = "re_test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof fetch;
  try {
    const result = await sendEmail({ to: "sam@example.com", subject: "Hi", text: "Hello" });
    assert.deepEqual(result, { sent: false, reason: "resend-401" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sendEmail soft-fails when fetch throws", async () => {
  process.env.RESEND_API_KEY = "re_test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const result = await sendEmail({ to: "sam@example.com", subject: "Hi", text: "Hello" });
    assert.deepEqual(result, { sent: false, reason: "resend-error" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
