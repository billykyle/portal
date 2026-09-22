import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  bookingActionRowClass,
  bookingPrimaryButtonClass,
  bookingSecondaryButtonClass,
} from "../../components/booking-actions";
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

const bookingId = "11111111-1111-4111-8111-111111111111";
const clientId = "client-1";
const primaryButtonClass = bookingPrimaryButtonClass;
const secondaryButtonClass = bookingSecondaryButtonClass;
const confirmationActionRowClass = bookingActionRowClass;

function actionClass(html: string, label: string) {
  const match = html.match(new RegExp(`class="([^"]+)"[^>]*>${label}<`));
  assert.ok(match, `expected ${label} action`);
  return match[1];
}

function futureBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: bookingId,
    address: "644 Plumrun Dr, West Chester, PA",
    services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
    startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    notes: "1234",
    status: "confirmed",
    clientId,
    ...overrides,
  };
}

test("book confirmation is a centered hero with the shoot details", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: {
        id: bookingId,
        address: "644 Plumrun Dr, West Chester, PA",
        services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
        startsAt,
        endsAt,
        notes: "1234",
        status: "confirmed",
        clientId,
      },
      timeZone: "America/New_York",
      clientId,
    }),
  );
  assert.match(html, /You(?:'|&#x27;)re all set\./);
  assert.match(html, /Real Estate · Photography/);
  assert.match(html, /Real Estate · Aerial Photos/);
  assert.match(html, /644 Plumrun Dr/);
  assert.match(html, /1 hour/);
  assert.match(html, /Eastern/);
  assert.match(html, /1234/);
  assert.match(html, /Back to Scheduling/);
  assert.match(html, new RegExp(`href="${CLIENT_SCHEDULING}"`));
  assert.match(html, /<dl class="mt-10 w-full text-left">/);
  assert.match(html, /lg:max-w-3xl/);
  assert.doesNotMatch(html, /grid-cols-2/);
  assert.doesNotMatch(html, /lg:grid/);
  const servicesAt = html.indexOf(">Services<");
  const addressAt = html.indexOf(">Address<");
  const whenAt = html.indexOf(">When<");
  const notesAt = html.indexOf(">Notes<");
  assert.ok(servicesAt >= 0 && addressAt > servicesAt && whenAt > addressAt && notesAt > whenAt);
  assert.equal(actionClass(html, "Back to Scheduling"), primaryButtonClass);
  assert.doesNotMatch(html, />Home</);
  assert.doesNotMatch(html, /Book another/);
  assert.doesNotMatch(html, new RegExp(`href="${CLIENT_HOME}"`));
  assert.doesNotMatch(html, /Shoot updated/);
});

test("confirmation page puts Modify and Cancel first as primary actions", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: futureBooking(),
      timeZone: "America/New_York",
      clientId,
    }),
  );
  const modifyAt = html.indexOf(">Modify<");
  const cancelAt = html.indexOf(">Cancel<");
  const schedulingAt = html.indexOf(">Back to Scheduling<");
  assert.ok(modifyAt >= 0, "expected a Modify button");
  assert.ok(cancelAt > modifyAt, "Modify should come before Cancel");
  assert.ok(schedulingAt > cancelAt, "Scheduling should stay after Modify and Cancel");
  assert.equal(actionClass(html, "Modify"), primaryButtonClass);
  assert.equal(actionClass(html, "Cancel"), secondaryButtonClass);
  assert.equal(actionClass(html, "Back to Scheduling"), primaryButtonClass);
  assert.match(html, new RegExp(`class="${confirmationActionRowClass}"`));
  assert.doesNotMatch(html, /flex-col gap-3 sm:flex-row/);
  assert.doesNotMatch(html, />Home</);
  assert.doesNotMatch(html, /Book another/);
  assert.match(html, /href="\/scheduling\?modify=11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /href="[^"]*(?:address|notes|service|placeId)=/);
  assert.match(html, /name="bookingId"/);
  assert.match(html, /11111111-1111-4111-8111-111111111111/);
});

test("modify confirmation uses the updated hero and keeps the compact footer", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: futureBooking({
        services: ["Real Estate · Photography"],
        notes: null,
      }),
      timeZone: "America/New_York",
      updated: true,
      clientId,
    }),
  );
  assert.match(html, /Shoot updated\./);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re booked/);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re all set/);
  assert.doesNotMatch(html, /Book another/);
  assert.doesNotMatch(html, />Home</);
  assert.equal(actionClass(html, "Back to Scheduling"), primaryButtonClass);
  assert.match(html, new RegExp(`class="${confirmationActionRowClass}"`));
  assert.equal(actionClass(html, "Modify"), primaryButtonClass);
  assert.equal(actionClass(html, "Cancel"), secondaryButtonClass);
});

test("cancelled confirmation uses cancelled hero and hides modify/cancel", () => {
  const html = renderToStaticMarkup(
    createElement(BookingConfirmation, {
      booking: futureBooking({
        status: "cancelled",
        services: ["Real Estate · Photography"],
      }),
      timeZone: "America/New_York",
      clientId,
    }),
  );
  assert.match(html, /Shoot cancelled\./);
  assert.match(html, /Your appointment with Billy Kyle has been cancelled\./);
  assert.match(html, /Real Estate · Photography/);
  assert.match(html, /644 Plumrun Dr/);
  assert.match(html, /Back to Scheduling/);
  assert.match(html, new RegExp(`href="${CLIENT_SCHEDULING}"`));
  assert.equal(actionClass(html, "Back to Scheduling"), primaryButtonClass);
  assert.doesNotMatch(html, />Home</);
  assert.doesNotMatch(html, /Book another/);
  assert.doesNotMatch(html, new RegExp(`href="${CLIENT_HOME}"`));
  assert.doesNotMatch(html, new RegExp(`class="${confirmationActionRowClass}"`));
  assert.doesNotMatch(html, />Modify</);
  assert.doesNotMatch(html, />Cancel</);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re booked/);
  assert.doesNotMatch(html, /You(?:'|&#x27;)re all set/);
});
