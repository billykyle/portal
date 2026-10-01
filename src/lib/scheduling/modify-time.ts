import { bookingStartIsPast } from "./horizon";
import { bookingSlotMinutes } from "./services";

/** Admin and agent saves may use a start that is already in the past. Clients may not. */
export function isPastAdminBookingStart(input: { fromAdmin: boolean; start: Date; now: Date }) {
  return input.fromAdmin && !Number.isNaN(input.start.getTime()) && bookingStartIsPast(input.start, input.now);
}

/**
 * Past admin and agent updates ignore the submitted end and offered slots.
 * Length is the service total, the same rule as an admin create.
 */
export function pastAdminModifyWindow(input: {
  start: Date;
  services: readonly string[];
  commercialHours?: number | null;
}): { start: Date; end: Date } | null {
  const minutes = bookingSlotMinutes(input.services, input.commercialHours);
  if (minutes == null || minutes <= 0) return null;
  return { start: input.start, end: new Date(input.start.getTime() + minutes * 60 * 1000) };
}
