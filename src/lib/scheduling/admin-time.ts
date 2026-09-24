import { bookingSlotMinutes } from "./services";
import { DEFAULT_TIMEZONE } from "./rules";
import { overlaps, type Interval } from "./intervals";
import { parseDateKey, utcToZonedParts, zonedDateTimeToUtc, type CalendarDate } from "./zoned-time";

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

export function adminShootWindow(
  date: string,
  time: string,
  services: readonly string[],
  timeZone = DEFAULT_TIMEZONE,
): { start: Date; end: Date; timeZone: string } | null {
  const day = parseAdminShootDate(date);
  const clock = parseAdminShootTime(time);
  if (!day || !clock.ok) return null;
  const start = zonedDateTimeToUtc(timeZone, { ...day, hour: clock.hour, minute: clock.minute });
  const end = new Date(start.getTime() + bookingSlotMinutes(services) * 60 * 1000);
  return { start, end, timeZone };
}

export function shootOverlapWarning(
  window: Interval,
  jobs: readonly Interval[],
): string | null {
  return jobs.some((job) => overlaps(window, job)) ? "Overlaps an existing booking." : null;
}
