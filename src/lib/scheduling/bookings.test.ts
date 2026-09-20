import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingList } from "../../components/booking-list";
import { adminCalendarGapNotice, canModifyBooking } from "./bookings";

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

test("client upcoming cards show Modify before Cancel", () => {
  const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const html = renderToStaticMarkup(
    createElement(BookingList, {
      bookings: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          address: "644 Plumrun Dr, West Chester, PA",
          services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
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
  const modifyAt = html.indexOf(">Modify<");
  const cancelAt = html.indexOf(">Cancel<");
  assert.ok(modifyAt >= 0, "expected a Modify action");
  assert.ok(cancelAt > modifyAt, "Modify should be paired before Cancel");
  assert.match(html, /modify=11111111-1111-4111-8111-111111111111/);
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(BookingList, {
        bookings: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            address: "644 Plumrun Dr, West Chester, PA",
            startsAt,
            endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
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
