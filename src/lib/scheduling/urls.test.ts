import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_BOOKINGS, CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "../routes";
import {
  adminBookingHref,
  adminBookingTimesHref,
  schedulingBookHref,
  schedulingConfirmedHref,
  schedulingEditorHref,
  schedulingTimesHref,
} from "./urls";

const bookingId = "11111111-1111-4111-8111-111111111111";

test("book and times hrefs stay short", () => {
  assert.equal(schedulingBookHref(), CLIENT_SCHEDULING);
  assert.equal(schedulingTimesHref(), CLIENT_SCHEDULING_TIMES);
  assert.equal(schedulingTimesHref({ error: "Pick a time." }), `${CLIENT_SCHEDULING_TIMES}?error=Pick+a+time.`);
  assert.equal(schedulingBookHref({ modify: bookingId }), `${CLIENT_SCHEDULING}?modify=${bookingId}`);
  assert.equal(
    schedulingTimesHref({ modify: bookingId, error: "Pick a time." }),
    `${CLIENT_SCHEDULING_TIMES}?error=Pick+a+time.&modify=${bookingId}`,
  );
  assert.equal(schedulingBookHref({ cancelled: "1" }), `${CLIENT_SCHEDULING}?cancelled=1`);
  assert.equal(schedulingConfirmedHref(bookingId), `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}`);
  assert.equal(
    schedulingConfirmedHref(bookingId, { updated: true }),
    `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}?updated=1`,
  );
  assert.equal(
    schedulingConfirmedHref(bookingId, { calendar: "failed", email: "failed" }),
    `${CLIENT_SCHEDULING_CONFIRMED}/${bookingId}?calendar=failed&email=failed`,
  );
  assert.doesNotMatch(schedulingTimesHref({ modify: bookingId, error: "Pick a time." }), /address|service|notes|placeId/);
  assert.doesNotMatch(schedulingBookHref({ modify: bookingId }), /address|service|notes|placeId/);
});

test("admin modify hrefs stay under /admin/bookings/{id}", () => {
  assert.equal(adminBookingHref(bookingId), `${ADMIN_BOOKINGS}/${bookingId}`);
  assert.equal(adminBookingTimesHref(bookingId), `${ADMIN_BOOKINGS}/${bookingId}/times`);
  assert.equal(
    adminBookingTimesHref(bookingId, { error: "Pick a time." }),
    `${ADMIN_BOOKINGS}/${bookingId}/times?error=Pick+a+time.`,
  );
  assert.equal(schedulingEditorHref({ fromAdmin: true, bookingId }), `${ADMIN_BOOKINGS}/${bookingId}`);
  assert.equal(schedulingEditorHref({ bookingId }), `${CLIENT_SCHEDULING}?modify=${bookingId}`);
  assert.equal(schedulingEditorHref({}), CLIENT_SCHEDULING);
});
