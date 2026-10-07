import { getTimes } from "suncalc";
import type { Interval } from "./intervals";
import { bookingStartAllowed } from "./horizon";
import { DEFAULT_TIMEZONE } from "./rules";
import { parseSchedulingServices, TWILIGHT_SERVICE } from "./services";
import {
  addCalendarDays,
  calendarDateKey,
  parseDateKey,
  tzOffsetMs,
  utcToZonedParts,
  zonedDateTimeToUtc,
  type CalendarDate,
} from "./zoned-time";

/**
 * Twilight is its own 30-minute sunset appointment. A client who also wants
 * other services gets two bookings: the regular slot, then this sunset slot.
 * Agent create and admin Book a shoot still reject a mixed service list.
 */

/** Philadelphia City Hall. Sunset is computed for this point, America/New_York. */
export const PHILLY_SUNSET_LATITUDE = 39.9526;
export const PHILLY_SUNSET_LONGITUDE = -75.1652;

export const TWILIGHT_SLOT_MINUTES = 30;

export const TWILIGHT_ALONE_ERROR =
  "Twilight is its own appointment. Book it without other services.";

export const TWILIGHT_DAY_TAKEN = "That day already has a Twilight booking.";

/** Floor a clock time to the previous 15-minute mark. Seconds count. */
export function roundDownToQuarterHour(parts: {
  hour: number;
  minute: number;
  second?: number;
}): { hour: number; minute: number } {
  const totalSeconds = parts.hour * 3600 + parts.minute * 60 + (parts.second ?? 0);
  const quarter = 15 * 60;
  const rounded = Math.floor(totalSeconds / quarter) * quarter;
  return {
    hour: Math.floor(rounded / 3600),
    minute: Math.floor((rounded % 3600) / 60),
  };
}

function isRealCalendarDate(date: CalendarDate): boolean {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return (
    probe.getUTCFullYear() === date.year &&
    probe.getUTCMonth() === date.month - 1 &&
    probe.getUTCDate() === date.day
  );
}

/** Sunset instant for a civil date in `timeZone`, DST included via the zone offset. */
export function phillySunset(date: CalendarDate, timeZone = DEFAULT_TIMEZONE): Date | null {
  const noon = zonedDateTimeToUtc(timeZone, { ...date, hour: 12, minute: 0 });
  const utcOffset = Math.round(tzOffsetMs(noon, timeZone) / 60_000);
  return (
    getTimes(noon, PHILLY_SUNSET_LATITUDE, PHILLY_SUNSET_LONGITUDE, 0, utcOffset).sunset ?? null
  );
}

/** One 30-minute slot: sunset rounded down to the previous 15-minute mark. */
export function twilightSlotForCalendarDate(
  date: CalendarDate,
  timeZone = DEFAULT_TIMEZONE,
): Interval | null {
  const sunset = phillySunset(date, timeZone);
  if (!sunset) return null;
  const parts = utcToZonedParts(sunset, timeZone);
  const rounded = roundDownToQuarterHour(parts);
  const start = zonedDateTimeToUtc(timeZone, {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: rounded.hour,
    minute: rounded.minute,
    second: 0,
  });
  return { start, end: new Date(start.getTime() + TWILIGHT_SLOT_MINUTES * 60_000) };
}

/** `6:30pm` style, the same shape the admin time field already accepts. */
export function twilightClockForDateKey(dateKey: string, timeZone = DEFAULT_TIMEZONE): string | null {
  const day = parseDateKey(dateKey);
  if (!day || !isRealCalendarDate(day)) return null;
  const slot = twilightSlotForCalendarDate(day, timeZone);
  if (!slot) return null;
  const parts = utcToZonedParts(slot.start, timeZone);
  const hour12 = parts.hour % 12 || 12;
  const suffix = parts.hour >= 12 ? "pm" : "am";
  return `${hour12}:${String(parts.minute).padStart(2, "0")}${suffix}`;
}

export function twilightDateKey(start: Date, timeZone = DEFAULT_TIMEZONE): string {
  return calendarDateKey(utcToZonedParts(start, timeZone));
}

export function includesTwilight(services: readonly string[]): boolean {
  return parseSchedulingServices(services).includes(TWILIGHT_SERVICE);
}

/** True only when Twilight is the entire selection. */
export function isTwilightBooking(services: readonly string[]): boolean {
  const parsed = parseSchedulingServices(services);
  return parsed.length === 1 && parsed[0] === TWILIGHT_SERVICE;
}

export function twilightAloneError(services: readonly string[]): string | null {
  const parsed = parseSchedulingServices(services);
  if (!parsed.includes(TWILIGHT_SERVICE)) return null;
  if (parsed.length === 1) return null;
  return TWILIGHT_ALONE_ERROR;
}

/** Column value for a confirmed Twilight start. Anything else leaves the day free. */
export function twilightDayValue(
  services: readonly string[],
  start: Date | null,
  status = "confirmed",
  timeZone = DEFAULT_TIMEZONE,
): string | null {
  if (status !== "confirmed" || !start || !includesTwilight(services)) return null;
  return twilightDateKey(start, timeZone);
}

export type TwilightDayBooking = {
  id?: string;
  status: string;
  services?: readonly string[] | null;
  startsAt?: Date | null;
  twilightDay?: string | null;
};

/** Another confirmed Twilight on the same Eastern calendar day, including a different clock time. */
export function twilightDayConflict(
  candidate: { services: readonly string[]; start: Date; id?: string },
  existing: readonly TwilightDayBooking[],
  timeZone = DEFAULT_TIMEZONE,
): string | null {
  if (!includesTwilight(candidate.services)) return null;
  const key = twilightDateKey(candidate.start, timeZone);
  const taken = existing.some((row) => {
    if (row.status !== "confirmed") return false;
    if (candidate.id && row.id === candidate.id) return false;
    if (row.twilightDay) return row.twilightDay === key;
    if (!row.startsAt || !row.services || !includesTwilight(row.services)) return false;
    return twilightDateKey(row.startsAt, timeZone) === key;
  });
  return taken ? TWILIGHT_DAY_TAKEN : null;
}

/**
 * Postgres unique violation on `bookings_one_twilight_per_day`.
 * Walks `cause` because the driver wraps the database error.
 */
export function isTwilightDayConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const constraint = String(record.constraint_name ?? record.constraint ?? "");
    const message =
      typeof record.message === "string"
        ? record.message
        : current instanceof Error
          ? current.message
          : "";
    if (constraint === "bookings_one_twilight_per_day") return true;
    if (/bookings_one_twilight_per_day/i.test(message)) return true;
    if (record.code === "23505" && /twilight/i.test(message)) return true;
    current = record.cause;
  }
  return false;
}

export function twilightConflictMessage(error: unknown): string | null {
  return isTwilightDayConflict(error) ? TWILIGHT_DAY_TAKEN : null;
}

/**
 * One sunset slot per horizon day. Booked Twilight days are omitted.
 * Same-day, blocked weekdays, and lead time match other new bookings.
 */
export function generateTwilightCandidateSlots(input: {
  now: Date;
  timeZone: string;
  daysAhead: number;
  minLeadMinutes: number;
  retainStarts?: readonly Date[];
  twilightBookedDays?: readonly string[];
}): Interval[] {
  const nowParts = utcToZonedParts(input.now, input.timeZone);
  const minStart = input.now.getTime() + input.minLeadMinutes * 60 * 1000;
  const retain = new Set((input.retainStarts ?? []).map((value) => value.getTime()));
  const booked = new Set(input.twilightBookedDays ?? []);
  const slots: Interval[] = [];
  for (let dayOffset = 0; dayOffset < input.daysAhead; dayOffset += 1) {
    const day = addCalendarDays(nowParts, dayOffset);
    const slot = twilightSlotForCalendarDate(day, input.timeZone);
    if (!slot) continue;
    const key = twilightDateKey(slot.start, input.timeZone);
    const retained = retain.has(slot.start.getTime());
    if (booked.has(key) && !retained) continue;
    if (slot.start.getTime() < minStart && !retained) continue;
    if (
      !bookingStartAllowed({
        start: slot.start,
        now: input.now,
        timeZone: input.timeZone,
        retainStarts: input.retainStarts,
      })
    ) {
      continue;
    }
    slots.push(slot);
  }
  return slots;
}

/**
 * A modified Twilight keeps its saved start. That day does not also offer
 * a different sunset time.
 */
export function withoutRetainedTwilightDaySunset(
  slots: readonly Interval[],
  retainStarts: readonly Date[] | undefined,
  timeZone: string,
): Interval[] {
  if (!retainStarts?.length) return [...slots];
  const retainedByDay = new Map<string, Set<number>>();
  for (const start of retainStarts) {
    const key = twilightDateKey(start, timeZone);
    const times = retainedByDay.get(key) ?? new Set<number>();
    times.add(start.getTime());
    retainedByDay.set(key, times);
  }
  return slots.filter((slot) => {
    const key = twilightDateKey(slot.start, timeZone);
    const retained = retainedByDay.get(key);
    if (!retained) return true;
    return retained.has(slot.start.getTime());
  });
}
