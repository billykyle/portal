import type { Interval } from "./intervals";
import { addCalendarDays, calendarDateKey, utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";
import type { SchedulingHours } from "./config";

export function generateCandidateSlots(input: SchedulingHours & { now: Date }): Interval[] {
  const slots: Interval[] = [];
  const nowParts = utcToZonedParts(input.now, input.timeZone);
  const minStart = input.now.getTime() + input.minLeadMinutes * 60 * 1000;
  const step = Math.max(5, input.stepMinutes);
  const duration = Math.max(5, input.slotMinutes);

  for (let dayOffset = 0; dayOffset < input.daysAhead; dayOffset += 1) {
    const day = addCalendarDays(nowParts, dayOffset);
    const lastStartMinute = input.closeHour * 60;
    for (let minute = input.openHour * 60; minute <= lastStartMinute; minute += step) {
      const hour = Math.floor(minute / 60);
      const min = minute % 60;
      const start = zonedDateTimeToUtc(input.timeZone, { ...day, hour, minute: min });
      const end = new Date(start.getTime() + duration * 60 * 1000);
      if (start.getTime() < minStart) continue;
      slots.push({ start, end });
    }
  }
  return slots;
}

export function formatSlotRange(start: Date, end: Date, timeZone: string) {
  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone };
  const startParts = utcToZonedParts(start, timeZone);
  return {
    dateKey: calendarDateKey(startParts),
    dateLabel,
    timeLabel: `${start.toLocaleTimeString("en-US", timeOpts)} – ${end.toLocaleTimeString("en-US", timeOpts)}`,
  };
}

export function formatBookingWhen(start: Date, end: Date, timeZone: string) {
  const { dateLabel, timeLabel } = formatSlotRange(start, end, timeZone);
  return `${dateLabel} · ${timeLabel}`;
}
