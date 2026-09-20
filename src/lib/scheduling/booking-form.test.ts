import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingUserError, parseBookingSlot, readBookingFormSlot } from "./booking-form";

const start = "2026-09-21T14:00:00.000Z";
const end = "2026-09-21T14:45:00.000Z";
const slot = `${start}|${end}`;

test("parseBookingSlot ignores an empty hidden field and keeps the radio value", () => {
  assert.equal(parseBookingSlot(""), null);
  assert.equal(parseBookingSlot(["", ""]), null);
  assert.deepEqual(parseBookingSlot(["", slot]), { startIso: start, endIso: end });
  assert.deepEqual(parseBookingSlot(slot), { startIso: start, endIso: end });
});

test("parseBookingSlot rejects inverted or incomplete ranges", () => {
  assert.equal(parseBookingSlot(`${end}|${start}`), null);
  assert.equal(parseBookingSlot(`${start}|`), null);
  assert.equal(parseBookingSlot("not-a-slot"), null);
});

test("readBookingFormSlot reads every slot field from FormData", () => {
  const form = new FormData();
  form.append("slot", "");
  form.append("slot", slot);
  assert.deepEqual(readBookingFormSlot(form), { startIso: start, endIso: end });
});

test("bookingUserError truncates long calendar messages for the query string", () => {
  assert.equal(bookingUserError(new Error("")), "Booking could not be completed.");
  const long = "x".repeat(200);
  assert.equal(bookingUserError(new Error(long)).length, 180);
  assert.ok(bookingUserError(new Error(long)).endsWith("…"));
});
