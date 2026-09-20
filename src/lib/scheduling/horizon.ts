import type { SchedulingHours } from "./config";
import { schedulingHours } from "./config";
import { DEFAULT_MAX_BOOKING_MONTHS, DEFAULT_WEEK_DAYS } from "./rules";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateKey,
  compareCalendarDates,
  daysInclusive,
  parseDateKey,
  todayInZone,
  utcToZonedParts,
  zonedDateTimeToUtc,
  type CalendarDate,
} from "./zoned-time";

export function lastBookableDate(
  now: Date,
  timeZone: string,
  months = DEFAULT_MAX_BOOKING_MONTHS,
): CalendarDate {
  return addCalendarMonths(todayInZone(now, timeZone), months);
}

export function firstBookableDate(now: Date, hours: SchedulingHours): CalendarDate {
  const today = todayInZone(now, hours.timeZone);
  const minStart = now.getTime() + hours.minLeadMinutes * 60 * 1000;
  const lastStartMinute = hours.closeHour * 60;
  const lastStart = zonedDateTimeToUtc(hours.timeZone, {
    ...today,
    hour: Math.floor(lastStartMinute / 60),
    minute: lastStartMinute % 60,
  });
  if (lastStart.getTime() >= minStart) return today;
  return addCalendarDays(today, 1);
}

export function bookingHorizonDays(now: Date, timeZone: string): number {
  return daysInclusive(todayInZone(now, timeZone), lastBookableDate(now, timeZone));
}

/** Working hours plus a bookable window of at least 3 months from `now`. */
export function hoursForNow(now: Date, slotMinutes?: number): SchedulingHours {
  const hours = schedulingHours();
  return {
    ...hours,
    slotMinutes: slotMinutes ?? hours.slotMinutes,
    daysAhead: Math.max(hours.daysAhead, bookingHorizonDays(now, hours.timeZone)),
  };
}

export function weekDateKeys(
  weekStart: CalendarDate,
  last: CalendarDate,
  count = DEFAULT_WEEK_DAYS,
): string[] {
  const keys: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const day = addCalendarDays(weekStart, offset);
    if (compareCalendarDates(day, last) > 0) break;
    keys.push(calendarDateKey(day));
  }
  return keys;
}

export function formatDateKeyLabel(dateKey: string, timeZone: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const noon = zonedDateTimeToUtc(timeZone, { ...parsed, hour: 12, minute: 0 });
  return noon.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

export function monthGrid(year: number, month: number): Array<CalendarDate | null> {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<CalendarDate | null> = [];
  for (let pad = 0; pad < firstWeekday; pad += 1) cells.push(null);
  for (let day = 1; day <= lastDay; day += 1) cells.push({ year, month, day });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function dateIsBookable(date: CalendarDate, first: CalendarDate, last: CalendarDate) {
  return compareCalendarDates(date, first) >= 0 && compareCalendarDates(date, last) <= 0;
}

export function formatMonthTitle(year: number, month: number) {
  const utc = new Date(Date.UTC(year, month - 1, 1));
  return utc.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function parseRequiredDateKey(key: string): CalendarDate {
  return parseDateKey(key) ?? { year: 1970, month: 1, day: 1 };
}

export { calendarDateKey, parseDateKey, DEFAULT_WEEK_DAYS, DEFAULT_MAX_BOOKING_MONTHS };
