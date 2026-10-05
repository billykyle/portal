import { shootOverlapWarning } from "./admin-time";
import type { Interval } from "./intervals";
import { pastAdminModifyWindow } from "./modify-time";
import { COMMERCIAL_VIDEO_HOURS_ERROR } from "./services";

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
