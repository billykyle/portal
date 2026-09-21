import type { Interval } from "./intervals";
import { bookingStartAllowed } from "./horizon";
import { addCalendarDays, calendarDateKey, utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";
import type { SchedulingHours } from "./config";

export function generateCandidateSlots(
  input: SchedulingHours & { now: Date; retainStarts?: readonly Date[] },
): Interval[] {
  const slots: Interval[] = [];
  const nowParts = utcToZonedParts(input.now, input.timeZone);
  const minStart = input.now.getTime() + input.minLeadMinutes * 60 * 1000;
  const retainStarts = new Set((input.retainStarts ?? []).map((value) => value.getTime()));
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
      const retained = retainStarts.has(start.getTime());
      if (start.getTime() < minStart && !retained) continue;
      if (
        !bookingStartAllowed({
          start,
          now: input.now,
          timeZone: input.timeZone,
          retainStarts: input.retainStarts,
        })
      ) {
        continue;
      }
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

export function formatBookingDuration(start: Date, end: Date) {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourLabel = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (rest === 0) return hourLabel;
  return `${hourLabel} ${rest} minute${rest === 1 ? "" : "s"}`;
}

export function formatBookingTimeZone(timeZone: string) {
  return timeZone === "America/New_York" ? "Eastern" : timeZone;
}
