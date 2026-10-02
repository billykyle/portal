import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  bookingActionRowClass,
  bookingPrimaryButtonClass,
  bookingSecondaryButtonClass,
} from "../../components/booking-actions";
import { BookingList, ClientQueueSection } from "../../components/booking-list";
import {
  adminCalendarGapNotice,
  canAdminModifyBooking,
  canAdminOpenBooking,
  canModifyBooking,
  canQueueUpcomingBooking,
  splitActiveBookings,
} from "./bookings";
import { formatBookingServices } from "./services";
import { formatBookingWhen } from "./slots";

function actionClass(html: string, label: string) {
  const match = html.match(new RegExp(`class="([^"]+)"[^>]*>${label}<`));
  assert.ok(match, `expected ${label} action`);
  return match[1];
}

test("adminCalendarGapNotice is only for confirmed bookings missing a Calendar id", () => {
  assert.equal(adminCalendarGapNotice({ status: "confirmed", calendarEventId: null }), "Not on Google Calendar yet.");
  assert.equal(adminCalendarGapNotice({ status: "confirmed" }), "Not on Google Calendar yet.");
  assert.equal(adminCalendarGapNotice({ status: "confirmed", calendarEventId: "evt_1" }), null);
  assert.equal(adminCalendarGapNotice({ status: "cancelled", calendarEventId: null }), null);
});

test("canModifyBooking is only the owner of a confirmed shoot that has not started", () => {
  const now = new Date("2026-09-20T18:00:00.000Z");
  const owner = "client-1";
  const upcoming = {
    status: "confirmed",
    startsAt: new Date("2026-09-25T18:00:00.000Z"),
    clientId: owner,
  };
  assert.equal(canModifyBooking(upcoming, owner, now), true);
  assert.equal(canModifyBooking(upcoming, "other-client", now), false);
  assert.equal(canModifyBooking({ ...upcoming, status: "cancelled" }, owner, now), false);
  assert.equal(
    canModifyBooking({ ...upcoming, startsAt: new Date("2026-09-20T17:00:00.000Z") }, owner, now),
    false,
  );
  assert.equal(canModifyBooking({ ...upcoming, startsAt: now }, owner, now), false);
});

test("canQueueUpcomingBooking is only a confirmed shoot that has not started", () => {
  const now = new Date("2026-09-20T18:00:00.000Z");
  const upcoming = { status: "confirmed", startsAt: new Date("2026-09-25T18:00:00.000Z") };
  assert.equal(canQueueUpcomingBooking(upcoming, now), true);
  assert.equal(canQueueUpcomingBooking({ ...upcoming, status: "cancelled" }, now), false);
  assert.equal(canQueueUpcomingBooking({ ...upcoming, status: "queued", startsAt: null }, now), false);
  assert.equal(canQueueUpcomingBooking({ ...upcoming, startsAt: now }, now), false);
  assert.equal(canAdminOpenBooking({ status: "queued" }), true);
  assert.equal(canAdminOpenBooking({ status: "cancelled" }), false);
});

test("queue section is absent when empty and lists a shoot above a schedule link", () => {
  assert.equal(renderToStaticMarkup(createElement(ClientQueueSection, { bookings: [] })), "");
  const html = renderToStaticMarkup(
    createElement(ClientQueueSection, {
      bookings: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          address: "12 Wood View Drive",
          services: ["Real Estate · Photography"],
          startsAt: null,
          endsAt: null,
          status: "queued",
          notes: "Lockbox 1234",
          clientId: "client-1",
        },
      ],
    }),
  );
  assert.match(html, />Queue</);
  assert.match(html, /12 Wood View Drive/);
  assert.match(html, /Lockbox 1234/);
  assert.match(html, />Schedule a time</);
  assert.match(html, /href="\/scheduling\?modify=22222222-2222-4222-8222-222222222222"/);
  assert.doesNotMatch(html, /No queued/);
});

test("splitActiveBookings keeps queued shoots out of upcoming and past", () => {
  const now = new Date("2026-09-24T15:00:00.000Z").getTime();
  const rows = [
    { id: "q", status: "queued", startsAt: null },
    { id: "next", status: "confirmed", startsAt: new Date("2026-09-30T15:00:00.000Z") },
    { id: "past", status: "confirmed", startsAt: new Date("2026-09-01T15:00:00.000Z") },
  ];
  const split = splitActiveBookings(rows, now);
  assert.deepEqual(split.queued.map((row) => row.id), ["q"]);
  assert.deepEqual(split.upcoming.map((row) => row.id), ["next"]);
  assert.deepEqual(split.past.map((row) => row.id), ["past"]);
});

test("canAdminModifyBooking is any confirmed shoot, including one that already started", () => {
  const now = new Date("2026-09-20T18:00:00.000Z");
  const upcoming = { status: "confirmed", startsAt: new Date("2026-09-25T18:00:00.000Z") };
  assert.equal(canAdminModifyBooking(upcoming, now), true);
  assert.equal(canAdminModifyBooking({ ...upcoming, status: "cancelled" }, now), false);
  assert.equal(canAdminModifyBooking({ ...upcoming, startsAt: now }, now), true);
  assert.equal(
    canAdminModifyBooking({ ...upcoming, startsAt: new Date("2026-09-20T17:00:00.000Z") }, now),
    true,
  );
});

test("client upcoming cards show address, when, then services on one line", () => {
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const address = "644 Plumrun Dr, West Chester, PA";
  const services = ["Real Estate · Photography", "Real Estate · Aerial Photos"];
  const when = formatBookingWhen(startsAt, endsAt, "America/New_York");
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address,
          services,
          startsAt,
          endsAt,
          status: "confirmed",
          notes: null,
          clientId: "client-1",
        },
      ],
      emptyLabel: "No upcoming shoots yet.",
      timeZone: "America/New_York",
      allowCancel: true,
      allowModify: true,
      clientId: "client-1",
    }),
  );
  const addressAt = html.indexOf(address);
  const whenAt = html.indexOf(when);
  const servicesAt = html.indexOf(formatBookingServices(services));
  assert.ok(addressAt >= 0, "expected the shoot address");
  assert.ok(whenAt > addressAt, "date and time should follow the address");
  assert.ok(servicesAt > whenAt, "services should follow the date and time");
  assert.match(html, /font-medium/);
  assert.doesNotMatch(html, /flex flex-col gap-0.5/);
  const modifyAt = html.indexOf(">Modify<");
  const cancelAt = html.indexOf(">Cancel<");
  assert.ok(modifyAt >= 0, "expected a Modify action");
  assert.ok(cancelAt > modifyAt, "Modify should be paired before Cancel");
  assert.equal(actionClass(html, "Modify"), bookingPrimaryButtonClass);
  assert.equal(actionClass(html, "Cancel"), bookingSecondaryButtonClass);
  assert.match(html, new RegExp(`class="${bookingActionRowClass}"`));
  assert.doesNotMatch(html, /class="text-sm text-\[#8e8e93\]"[^>]*>Modify</);
  assert.match(html, /href="\/scheduling\?modify=11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /href="[^"]*(?:address|notes|service|placeId)=/);
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(BookingList, {
        bookings: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            address,
            startsAt,
            endsAt,
            status: "confirmed",
            clientId: "client-1",
          },
        ],
        emptyLabel: "No upcoming bookings.",
        timeZone: "America/New_York",
        allowCancel: true,
        showClient: true,
      }),
    ),
    />Modify</,
  );
});

test("admin upcoming cards show Modify next to Cancel and link to the admin modify path", () => {
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address: "3900 City Ave, Philadelphia, PA",
          services: ["Real Estate · Photography"],
          startsAt,
          endsAt,
          status: "confirmed",
          clientId: "client-1",
          clientName: "Billy Kyle",
          inviteCode: "BK00001",
        },
      ],
      emptyLabel: "No upcoming bookings.",
      timeZone: "America/New_York",
      allowCancel: true,
      allowModify: true,
      admin: true,
      showClient: true,
    }),
  );
  const modifyAt = html.indexOf(">Modify<");
  const cancelAt = html.indexOf(">Cancel<");
  assert.ok(modifyAt >= 0, "expected a Modify action");
  assert.ok(cancelAt > modifyAt, "Modify should be paired before Cancel");
  assert.equal(actionClass(html, "Modify"), bookingPrimaryButtonClass);
  assert.equal(actionClass(html, "Cancel"), bookingSecondaryButtonClass);
  assert.match(html, /href="\/admin\/bookings\/11111111-1111-4111-8111-111111111111"/);
  assert.doesNotMatch(html, /modify=11111111-1111-4111-8111-111111111111/);
});

test("admin past cards can modify and do not offer cancel", () => {
  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address: "3900 City Ave, Philadelphia, PA",
          services: ["Real Estate · Photography"],
          startsAt,
          endsAt,
          status: "confirmed",
          clientId: "client-1",
        },
      ],
      emptyLabel: "No past bookings.",
      timeZone: "America/New_York",
      allowModify: true,
      admin: true,
    }),
  );
  assert.match(html, />Modify</);
  assert.doesNotMatch(html, />Cancel</);
  assert.match(html, /href="\/admin\/bookings\/11111111-1111-4111-8111-111111111111"/);
});

test("client past cards stay without modify or cancel", () => {
  const startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address: "644 Plumrun Dr, West Chester, PA",
          startsAt,
          endsAt,
          status: "confirmed",
          clientId: "client-1",
        },
      ],
      emptyLabel: "No upcoming shoots yet.",
      timeZone: "America/New_York",
      allowCancel: true,
      allowModify: true,
      clientId: "client-1",
    }),
  );
  assert.doesNotMatch(html, />Modify</);
  assert.doesNotMatch(html, />Cancel</);
});

test("desktop booking columns stay a single stack until the lg grid", () => {
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address: "3900 City Ave, Philadelphia, PA",
          startsAt,
          endsAt,
          status: "confirmed",
        },
      ],
      emptyLabel: "No upcoming bookings.",
      timeZone: "America/New_York",
      columns: 2,
    }),
  );
  assert.match(html, /lg:grid lg:grid-cols-2/);
});
