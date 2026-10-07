import { shootOverlapWarning } from "./admin-time";
import type { Interval } from "./intervals";
import { pastAdminModifyWindow } from "./modify-time";
import { COMMERCIAL_VIDEO_HOURS_ERROR } from "./services";

/**
 * Admin and agent scheduling of a queued shoot. Clients still use the slot grid.
 */
export function isAdminQueuedSchedule(input: { fromAdmin: boolean; status: string }) {
  return input.fromAdmin && input.status === "queued";
}

/**
 * Exact start, ignoring the open-slot grid. Agent modify uses this for queued
 * and already confirmed bookings. Admin queued scheduling does too. Admin
 * Bookings modify of a confirmed shoot stays on the grid.
 */
export function modifyUsesExactWindow(input: {
  scheduleOverride?: boolean;
  fromAdmin: boolean;
  status: string;
}) {
  return input.scheduleOverride === true || isAdminQueuedSchedule(input);
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

/**
 * Same warning as admin `create_booking`. Confirmed portal bookings only.
 * Google Calendar free/busy (Work or Personal, including all-day office blocks)
 * and drive buffers are not inputs and cannot reject the save.
 */
export function queuedScheduleOverlapWarning(
  window: Interval,
  confirmedBookings: readonly Interval[],
): string | null {
  return shootOverlapWarning(window, confirmedBookings);
}
