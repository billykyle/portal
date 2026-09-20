import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingConfirmation } from "../../components/booking-confirmation";
import { CLIENT_HOME, CLIENT_SCHEDULING } from "../routes";
import { formatBookingDuration, formatBookingTimeZone } from "./slots";

const startsAt = new Date("2026-09-25T18:00:00.000Z");
const endsAt = new Date("2026-09-25T19:00:00.000Z");

test("formatBookingDuration names hours and leftover minutes", () => {
  assert.equal(formatBookingDuration(startsAt, new Date("2026-09-25T18:45:00.000Z")), "45 minutes");
  assert.equal(formatBookingDuration(startsAt, endsAt), "1 hour");
  assert.equal(formatBookingDuration(startsAt, new Date("2026-09-25T19:15:00.000Z")), "1 hour 15 minutes");
  assert.equal(formatBookingTimeZone("America/New_York"), "Eastern");
});

test("book confirmation is a centered hero with the shoot details", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: {
        address: "644 Plumrun Dr, West Chester, PA",
        services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
        startsAt,
        endsAt,
        notes: "1234",
      },
      timeZone: "America/New_York",
    }),
  );
  assert.match(html, /You(?:'|&#x27;)re booked\./);
  assert.match(html, /Real Estate · Photography/);
  assert.match(html, /Real Estate · Aerial Photos/);
  assert.match(html, /644 Plumrun Dr/);
  assert.match(html, /1 hour/);
  assert.match(html, /Eastern/);
  assert.match(html, /1234/);
  assert.match(html, /Back to Scheduling/);
  assert.match(html, /Book another/);
  assert.match(html, new RegExp(`href="${CLIENT_SCHEDULING}"`));
  assert.match(html, new RegExp(`href="${CLIENT_HOME}"`));
  assert.doesNotMatch(html, /Shoot updated/);
});

test("modify confirmation uses the updated hero and skips Book another", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: {
        address: "644 Plumrun Dr, West Chester, PA",
        services: ["Real Estate · Photography"],
        startsAt,
        endsAt,
      },
      timeZone: "America/New_York",
      updated: true,
    }),
  );
  assert.match(html, /Shoot updated\./);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re booked/);
  assert.doesNotMatch(html, /Book another/);
  assert.match(html, /Back to Scheduling/);
});
