import { normalizeAddress } from "@/lib/scheduling/address";
import { DEFAULT_TIMEZONE } from "@/lib/scheduling/rules";
import { calendarDateKey, utcToZonedParts } from "@/lib/scheduling/zoned-time";

const STREET_SUFFIX: Record<string, string> = {
  road: "rd",
  rd: "rd",
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  drive: "dr",
  dr: "dr",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  boulevard: "blvd",
  blvd: "blvd",
  place: "pl",
  pl: "pl",
  terrace: "ter",
  ter: "ter",
  circle: "cir",
  cir: "cir",
  highway: "hwy",
  hwy: "hwy",
  parkway: "pkwy",
  pkwy: "pkwy",
};

/** A unit on the booking is a different shoot than the building folder. */
const UNIT_PREFIX = /^(unit|apt|apartment|suite|ste|#|no)\b/;

export type DeliveredShootBooking = {
  address: string;
  startsAt: Date | null;
  status: string;
  userId: string | null;
  email: string | null;
  notes: string | null;
};

export type DeliveryShootContact = {
  userId: string | null;
  email: string | null;
  notes: string | null;
};

function streetLine(address: string) {
  return address.split(",")[0] ?? address;
}

function addressMatchKey(address: string) {
  return normalizeAddress(address)
    .split(" ")
    .filter(Boolean)
    .map((word) => STREET_SUFFIX[word] ?? word)
    .join(" ");
}

/**
 * Folder address against a booking address.
 * "309 Southbank Road" matches "309 Southbank Rd, West Chester, PA".
 * It does not match a different unit at that building.
 */
export function shootAddressMatchesBooking(shootAddress: string, bookingAddress: string) {
  const shootLine = addressMatchKey(streetLine(shootAddress));
  const bookingLine = addressMatchKey(streetLine(bookingAddress));
  if (shootLine && shootLine === bookingLine) return true;

  const shoot = addressMatchKey(shootAddress);
  const booking = addressMatchKey(bookingAddress);
  if (!shoot || !booking) return false;
  if (shoot === booking) return true;
  if (shoot.length < 8 || !booking.startsWith(`${shoot} `)) return false;
  const rest = booking.slice(shoot.length).trim();
  return !UNIT_PREFIX.test(rest);
}

export function bookingShootDateKey(startsAt: Date, timeZone = DEFAULT_TIMEZONE) {
  return calendarDateKey(utcToZonedParts(startsAt, timeZone));
}

/**
 * Confirmed bookings for this folder. The contact is `createdByUserId`:
 * the person who booked it, or the primary contact an admin booking attaches.
 */
export function bookingsForDeliveredShoot(
  shoot: { address: string; shotDate: string },
  rows: readonly DeliveredShootBooking[],
): DeliveryShootContact[] {
  const shotDate = shoot.shotDate.trim();
  return rows.flatMap((row) => {
    if (row.status !== "confirmed" || !row.startsAt) return [];
    if (bookingShootDateKey(row.startsAt) !== shotDate) return [];
    if (!shootAddressMatchesBooking(shoot.address, row.address)) return [];
    return [{ userId: row.userId, email: row.email, notes: row.notes }];
  });
}
