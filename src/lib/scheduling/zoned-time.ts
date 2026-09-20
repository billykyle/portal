export type CalendarDate = { year: number; month: number; day: number };
export type ZonedParts = CalendarDate & { hour: number; minute: number; second: number };

function formatParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = Object.fromEntries(
    dtf.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset of `timeZone` at `date`, in milliseconds (UTC = local - offset). */
export function tzOffsetMs(date: Date, timeZone: string) {
  const parts = formatParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function utcToZonedParts(date: Date, timeZone: string): ZonedParts {
  return formatParts(date, timeZone);
}

export function zonedDateTimeToUtc(
  timeZone: string,
  parts: CalendarDate & { hour: number; minute: number; second?: number },
): Date {
  const utc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  const first = new Date(utc - tzOffsetMs(new Date(utc), timeZone));
  return new Date(utc - tzOffsetMs(first, timeZone));
}

export function addCalendarDays(parts: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function addCalendarMonths(parts: CalendarDate, months: number): CalendarDate {
  const total = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(parts.day, lastDay) };
}

export function calendarDateKey(parts: CalendarDate): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return calendarDateKey(a).localeCompare(calendarDateKey(b));
}

export function daysInclusive(from: CalendarDate, to: CalendarDate): number {
  const start = Date.UTC(from.year, from.month - 1, from.day);
  const end = Date.UTC(to.year, to.month - 1, to.day);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function todayInZone(now: Date, timeZone: string): CalendarDate {
  const parts = utcToZonedParts(now, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}
