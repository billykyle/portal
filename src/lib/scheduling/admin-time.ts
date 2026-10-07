import { bookingStartIsPast } from "./horizon";
import { bookingSlotMinutes } from "./services";
import { DEFAULT_TIMEZONE } from "./rules";
import { overlaps, type Interval } from "./intervals";
import {
  calendarDateKey,
  parseDateKey,
  utcToZonedParts,
  zonedDateTimeToUtc,
  type CalendarDate,
} from "./zoned-time";

/**
 * Bare hour with no am/pm, always America/New_York: 1–7 is PM, 8–12 is AM
 * (so "12" is midnight and "7:40" is 7:40 PM). Explicit am/pm wins.
 * 0 and 13–23 are 24-hour times. This rule stays in code only.
 */
const TIME_INPUT = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;

export function parseAdminShootTime(
  raw: string,
): { ok: true; hour: number; minute: number } | { ok: false; error: string } {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Enter a time." };
  const match = TIME_INPUT.exec(text);
  if (!match) return { ok: false, error: "Could not read that time." };

  const hourText = Number(match[1]);
  const minute = match[2] == null ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isInteger(hourText) || !Number.isInteger(minute) || minute > 59) {
    return { ok: false, error: "Could not read that time." };
  }

  let hour = hourText;
  if (meridiem) {
    if (hour < 1 || hour > 12) return { ok: false, error: "Could not read that time." };
    if (meridiem === "am") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour === 0 || hour >= 13) {
    if (hour > 23) return { ok: false, error: "Could not read that time." };
  } else if (hour >= 1 && hour <= 7) {
    hour += 12;
  } else if (hour >= 8 && hour <= 12) {
    hour = hour === 12 ? 0 : hour;
  } else {
    return { ok: false, error: "Could not read that time." };
  }

  return { ok: true, hour, minute };
}

export function parseAdminShootDate(raw: string): CalendarDate | null {
  const parts = parseDateKey(raw);
  if (!parts) return null;
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() !== parts.month - 1 ||
    probe.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

/** Date and time inputs for a start that is already in the past. Future starts stay on the slot list. */
export function adminPastExactStart(
  currentSlot: string | undefined,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
): { date: string; time: string } | null {
  if (!currentSlot) return null;
  const sep = currentSlot.indexOf("|");
  if (sep <= 0) return null;
  const start = new Date(currentSlot.slice(0, sep));
  if (Number.isNaN(start.getTime()) || !bookingStartIsPast(start, now)) return null;
  const parts = utcToZonedParts(start, timeZone);
  const hour12 = parts.hour % 12 || 12;
  const suffix = parts.hour >= 12 ? "pm" : "am";
  return {
    date: calendarDateKey(parts),
    time: `${hour12}:${String(parts.minute).padStart(2, "0")}${suffix}`,
  };
}

export function formatAdminShootPreview(start: Date, timeZone = DEFAULT_TIMEZONE) {
  const parts = utcToZonedParts(start, timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(start);
  const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
  return `${weekday}, ${month} ${parts.day} at ${time}`;
}

/**
 * Admin modify posts optional exact date and time. When either field is filled,
 * that start wins over a selected open slot. Empty fields leave the slot radios in charge.
 */
export function adminExactSlotFromForm(
  formData: { get(name: string): unknown },
  services: readonly string[],
  commercialHours?: number | null,
  timeZone = DEFAULT_TIMEZONE,
):
  | { ok: true; used: false }
  | { ok: true; used: true; start: Date; end: Date }
  | { ok: false; error: string } {
  const date = String(formData.get("exactDate") ?? "").trim();
  const time = String(formData.get("exactTime") ?? "").trim();
  if (!date && !time) return { ok: true, used: false };
  if (!date || !time) return { ok: false, error: "Enter a date and time." };
  const window = adminShootWindow(date, time, services, timeZone, commercialHours);
  if (!window) return { ok: false, error: "Could not read that time." };
  return { ok: true, used: true, start: window.start, end: window.end };
}

export function adminShootWindow(
  date: string,
  time: string,
  services: readonly string[],
  timeZone = DEFAULT_TIMEZONE,
  commercialHours?: number | null,
): { start: Date; end: Date; timeZone: string } | null {
  const day = parseAdminShootDate(date);
  const clock = parseAdminShootTime(time);
  if (!day || !clock.ok) return null;
  const minutes = bookingSlotMinutes(services, commercialHours);
  if (minutes == null) return null;
  const start = zonedDateTimeToUtc(timeZone, { ...day, hour: clock.hour, minute: clock.minute });
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  return { start, end, timeZone };
}

export function shootOverlapWarning(
  window: Interval,
  jobs: readonly Interval[],
): string | null {
  return jobs.some((job) => overlaps(window, job)) ? "Overlaps an existing booking." : null;
}

/** Stable warning list for agent and admin override saves. Drops blanks and duplicates. */
export function collectScheduleWarnings(...items: Array<string | null | undefined>): string[] {
  const warnings: string[] = [];
  for (const item of items) {
    if (item && !warnings.includes(item)) warnings.push(item);
  }
  return warnings;
}
