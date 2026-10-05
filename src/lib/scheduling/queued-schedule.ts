import { overlaps, subtractInterval, type Interval } from "./intervals";
import { pastAdminModifyWindow } from "./modify-time";
import { COMMERCIAL_VIDEO_HOURS_ERROR } from "./services";

/** Distinct from the client slot-grid message so an agent can tell a real conflict apart. */
export const QUEUED_SCHEDULE_CONFLICT_ERROR = "That time overlaps another event.";

/**
 * Admin and agent scheduling of a queued shoot. Clients still use the slot grid.
 * A confirmed booking's future start stays on that grid too.
 */
export function isAdminQueuedSchedule(input: { fromAdmin: boolean; status: string }) {
  return input.fromAdmin && input.status === "queued";
}

/**
 * Exact start plus the service length. Ignores the submitted end, the open-slot
 * grid, blocked weekdays, business hours, and drive time.
 */
export function adminQueuedScheduleWindow(input: {
  startIso: string;
  services: readonly string[];
  commercialHours?: number | null;
}): { ok: true; start: Date; end: Date } | { ok: false; error: string } {
  const start = new Date(input.startIso);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Could not read that time." };
  const window = pastAdminModifyWindow({
    start,
    services: input.services,
    commercialHours: input.commercialHours,
  });
  if (!window) return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR };
  return { ok: true, start: window.start, end: window.end };
}

/** True overlap only. A neighbor that ends when this shoot starts is free. */
export function queuedScheduleConflictError(window: Interval, busy: readonly Interval[]): string | null {
  return busy.some((block) => overlaps(window, block)) ? QUEUED_SCHEDULE_CONFLICT_ERROR : null;
}

/**
 * A leftover calendar event for this booking must not block its own new time.
 * Free/busy blocks have no event id, so the listed event is punched out of busy.
 */
export function busyWithoutOwnCalendarEvent(
  busy: readonly Interval[],
  jobs: readonly { start: Date; end: Date; eventId?: string | null }[],
  calendarEventId: string | null | undefined,
): Interval[] {
  const eventId = calendarEventId?.trim() ?? "";
  let next = busy.map((block) => ({ start: new Date(block.start), end: new Date(block.end) }));
  if (!eventId) return next;
  for (const job of jobs) {
    if (job.eventId === eventId) next = subtractInterval(next, job);
  }
  return next;
}
