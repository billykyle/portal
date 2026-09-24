import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingUserError,
  offeredSlotForSubmission,
  parseBookingSlot,
  readBookingFormSlot,
  resolveSelectedSlot,
  toggleSelectedSlot,
} from "./booking-form";

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

test("toggleSelectedSlot deselects the same time and selects a different one", () => {
  assert.equal(toggleSelectedSlot(slot, slot), "");
  assert.equal(toggleSelectedSlot("", slot), slot);
  assert.equal(toggleSelectedSlot("other|slot", slot), slot);
});

test("resolveSelectedSlot keeps a live choice and follows a stale end back to the booking start", () => {
  const short = { start, end };
  const longer = { start, end: "2026-09-21T15:00:00.000Z" };
  const other = { start: "2026-09-21T16:00:00.000Z", end: "2026-09-21T16:45:00.000Z" };
  const currentSlot = slot;
  assert.equal(resolveSelectedSlot(`${other.start}|${other.end}`, [short, other], currentSlot), `${other.start}|${other.end}`);
  assert.equal(resolveSelectedSlot(slot, [longer], currentSlot), `${longer.start}|${longer.end}`);
  assert.equal(resolveSelectedSlot(`${other.start}|${other.end}`, [longer], currentSlot), `${longer.start}|${longer.end}`);
  assert.equal(resolveSelectedSlot("", [longer], currentSlot), `${longer.start}|${longer.end}`);
  assert.equal(resolveSelectedSlot("", [other], undefined), "");
});

test("offeredSlotForSubmission accepts the server duration when the posted end is stale", () => {
  const offered = { start, end: "2026-09-21T15:00:00.000Z", driveSecondsFromPrior: null };
  const other = { start: "2026-09-21T16:00:00.000Z", end: "2026-09-21T16:45:00.000Z", driveSecondsFromPrior: 120 };
  assert.equal(offeredSlotForSubmission([offered, other], start, end), offered);
  assert.equal(offeredSlotForSubmission([offered, other], start, null), offered);
  assert.equal(offeredSlotForSubmission([offered, other], start, offered.end), offered);
  assert.equal(offeredSlotForSubmission([offered, { ...offered }], start, end), undefined);
  assert.equal(offeredSlotForSubmission([offered], "not-a-date", end), undefined);
});

test("bookingUserError truncates long calendar messages for the query string", () => {
  assert.equal(bookingUserError(new Error("")), "Booking could not be completed.");
  const long = "x".repeat(200);
  assert.equal(bookingUserError(new Error(long)).length, 180);
  assert.ok(bookingUserError(new Error(long)).endsWith("…"));
});
