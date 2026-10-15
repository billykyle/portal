import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookingsForDeliveredShoot,
  shootAddressMatchesBooking,
  type DeliveredShootBooking,
} from "./delivery-match";

const shoot = { address: "309 Southbank Road", shotDate: "2026-10-13" };

function booking(overrides: Partial<DeliveredShootBooking> = {}): DeliveredShootBooking {
  return {
    address: "309 Southbank Rd, West Chester, PA",
    startsAt: new Date("2026-10-13T17:00:00.000Z"),
    status: "confirmed",
    userId: "melissa",
    email: "melissa.oeth@compass.com",
    notes: "cc desk@compass.com",
    ...overrides,
  };
}

test("a folder address matches the booking street, including Road and Rd", () => {
  assert.equal(
    shootAddressMatchesBooking("309 Southbank Road", "309 Southbank Rd, West Chester, PA 19382"),
    true,
  );
  assert.equal(shootAddressMatchesBooking("309 Southbank Road", "309 Southbank Road"), true);
  assert.equal(
    shootAddressMatchesBooking("12 Wood View Drive", "12 Wood View Dr, Philadelphia, PA"),
    true,
  );
  assert.equal(
    shootAddressMatchesBooking("309 Southbank Road", "309 Southbank Road Unit 2, West Chester, PA"),
    false,
  );
  assert.equal(shootAddressMatchesBooking("10 Main", "10 Main Street, Philadelphia, PA"), false);
  assert.equal(shootAddressMatchesBooking("14 Harbor Lane", "16 Harbor Lane, Philadelphia, PA"), false);
});

test("309 Southbank Road on Oct 13 includes the agent who booked that day", () => {
  const matched = bookingsForDeliveredShoot(shoot, [
    booking(),
    booking({
      userId: "other",
      email: "other.agent@compass.com",
      startsAt: new Date("2026-10-14T02:30:00.000Z"),
    }),
    booking({
      userId: "yesterday",
      email: "yesterday@compass.com",
      startsAt: new Date("2026-10-13T03:30:00.000Z"),
    }),
    booking({ status: "cancelled", userId: "cancelled", email: "cancelled@compass.com" }),
    booking({ status: "queued", startsAt: null, userId: "queued", email: "queued@compass.com" }),
    booking({
      address: "14 Harbor Lane, Philadelphia, PA",
      userId: "harbor",
      email: "harbor@compass.com",
    }),
    booking({
      address: "309 Southbank Road Unit 2, West Chester, PA",
      userId: "unit",
      email: "unit@compass.com",
    }),
  ]);
  assert.deepEqual(
    matched.map((row) => row.userId),
    ["melissa", "other"],
  );
  assert.equal(matched[0]?.email, "melissa.oeth@compass.com");
  assert.equal(matched[0]?.notes, "cc desk@compass.com");
});
