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
