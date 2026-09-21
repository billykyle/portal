import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  BOOKING_ICS_PATH,
  bookingIcsDownloadUrl,
  bookingIcsExpiry,
  bookingIcsFilename,
  buildBookingIcs,
  clientCalendarDescription,
  clientCalendarTitle,
  googleCalendarTemplateUrl,
  ICS_AFTER_END_MS,
  ICS_TOKEN_TTL_MS,
  readBookingIcsToken,
  signBookingIcsToken,
} from "./booking-ics";

const bookingId = "11111111-1111-4111-8111-111111111111";
const start = new Date("2026-09-22T14:00:00.000Z");
const end = new Date("2026-09-22T15:30:00.000Z");
const now = new Date("2026-09-21T12:00:00.000Z");

const previousSecret = process.env.JWT_SECRET;
afterEach(() => {
  if (previousSecret == null) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

function sampleIcs(overrides: Record<string, unknown> = {}) {
  return {
    bookingId,
    address: "12 Wood View Drive, Princeton, NJ",
    services: ["Real Estate · Photography", "Construction · Video"],
    start,
    end,
    notes: "Park in the driveway.",
    accessCodes: "Gate 4455",
    ...overrides,
  };
}

test("client calendar title uses Billy Kyle and the services", () => {
  assert.equal(
    clientCalendarTitle({ services: ["Real Estate · Photography", "Construction · Video"] }),
    "Billy Kyle · Real Estate · Photography, Construction · Video",
  );
  assert.equal(clientCalendarTitle({ services: [] }), "Shoot with Billy Kyle");
});

test("ICS token survives a round trip and rejects tampering or expiry", () => {
  process.env.JWT_SECRET = "ics-test-secret";
  const token = signBookingIcsToken(bookingId, end, now);
  assert.deepEqual(readBookingIcsToken(token, now), { bookingId });
  assert.equal(readBookingIcsToken(`${token}x`, now), null);
  assert.equal(readBookingIcsToken(token, new Date(now.getTime() + ICS_TOKEN_TTL_MS + 1000)), null);
});

test("ICS token lasts at least 90 days or 14 days after the shoot", () => {
  const near = new Date("2026-09-24T15:00:00.000Z");
  const far = new Date("2027-01-01T15:00:00.000Z");
  assert.equal(bookingIcsExpiry(near, now).getTime(), now.getTime() + ICS_TOKEN_TTL_MS);
  assert.equal(bookingIcsExpiry(far, now).getTime(), far.getTime() + ICS_AFTER_END_MS);
});

test("ICS file is a published event with when, where, services, and title", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const ics = buildBookingIcs(sampleIcs(), now);
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /METHOD:PUBLISH/);
  assert.match(unfolded, /SUMMARY:Billy Kyle · Real Estate · Photography\\, Construction · Video/);
  assert.match(unfolded, /LOCATION:12 Wood View Drive\\, Princeton\\, NJ/);
  assert.match(ics, /DTSTART:20260922T140000Z/);
  assert.match(ics, /DTEND:20260922T153000Z/);
  assert.match(unfolded, /Services: Real Estate · Photography\\, Construction · Video/);
  assert.match(unfolded, /Park in the driveway\./);
  assert.match(unfolded, /Gate 4455/);
  assert.match(ics, /UID:booking-11111111-1111-4111-8111-111111111111@portal\.billy-kyle\.com/);
  assert.match(ics, /SEQUENCE:0/);
  assert.match(ics, /STATUS:CONFIRMED/);
  assert.match(ics, /\r\n/);
  assert.equal(bookingIcsFilename(start), "2026-09-22-billy-kyle.ics");
});

test("updated ICS bumps SEQUENCE", () => {
  const ics = buildBookingIcs(sampleIcs({ updated: true }), now);
  assert.match(ics, /SEQUENCE:1/);
});

test("hosted ICS URL uses the public portal and a signed token", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  process.env.JWT_SECRET = "ics-test-secret";
  const url = bookingIcsDownloadUrl(bookingId, end, now);
  assert.match(url, new RegExp(`^https://portal\\.billy-kyle\\.com${BOOKING_ICS_PATH}/`));
  const token = url.slice(url.lastIndexOf("/") + 1);
  assert.deepEqual(readBookingIcsToken(token, now), { bookingId });
});

test("Google Calendar template carries title, when, where, and services", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const url = new URL(googleCalendarTemplateUrl(sampleIcs()));
  assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), clientCalendarTitle(sampleIcs()));
  assert.equal(url.searchParams.get("dates"), "20260922T140000Z/20260922T153000Z");
  assert.equal(url.searchParams.get("location"), "12 Wood View Drive, Princeton, NJ");
  assert.match(String(url.searchParams.get("details")), /Services: Real Estate · Photography, Construction · Video/);
});

test("calendar description includes the manage URL", () => {
  delete process.env.PORTAL_PUBLIC_URL;
  const description = clientCalendarDescription(sampleIcs({ updated: true }));
  assert.match(description, /Modify or cancel: https:\/\/portal\.billy-kyle\.com\/scheduling\/confirmed\/11111111-1111-4111-8111-111111111111\?updated=1/);
});
