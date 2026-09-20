/**
 * Client scheduling — Acuity replacement.
 *
 * Locked product rules (Billy, 2026-09-19). The next Calendar/Maps wiring
 * pass should keep these; only the I/O adapters change.
 *
 * 1. Google Calendar is the source of truth for busy time when credentials
 *    exist (`GOOGLE_CALENDAR_IDS` + WIF/OIDC or a local service-account key).
 *    Locked calendars are work `billy@atmosimagery.com` and personal
 *    `bkyle015@gmail.com`. A slot is busy if either calendar is busy. Do
 *    not use US Holidays. Portal
 *    bookings are always busy too, and are written to the work calendar when
 *    that write hook is live. A Calendar write failure (including 403 writer
 *    access) is logged and leaves `calendarEventId` null — Book shoot still
 *    confirms. Singular `GOOGLE_CALENDAR_ID` is still accepted.
 * 2. Address first. Never compute or show times until a shoot address is known.
 * 3. Travel hard-block: live drive time only between the prior job address
 *    and the new address. Same check against the next located job. Exclusive
 *    end times still count when Maps reports a drive — a slot ending at noon
 *    is not free to start elsewhere at noon if the ETA is greater than zero.
 *    Example that must never be offered: Philly at noon, Shore at 1pm.
 *    {@link TRAVEL_PAD_MINUTES} is 0 (Billy, 2026-09-20): no extra pad.
 *    Location-less neighbors do not invent travel minutes.
 * 4. Do not fake geography. If a travel check is required (two different known
 *    addresses) and drive time cannot be measured, refuse the slot. Never
 *    assume 0 minutes or a guessed duration.
 * 5. After a successful Book shoot (`createBooking`), send two Resend emails
 *    (no CC/BCC): client confirmation to the session email, and a
 *    `New booking: …` alert to Billy (`billy@billyhere.com` /
 *    `BOOKING_NOTIFY_EMAIL`). Do not require Pepper. Soft-fail: never roll
 *    back the calendar event or DB insert if mail fails. Calendar write is
 *    also soft-fail after the DB insert (and emails): try the Work insert,
 *    but a 403 must not fail the client confirm. Modify (`updateBooking`)
 *    uses the same two-send + Calendar soft-fail pattern, excluding the
 *    booking being edited from availability so its own slot stays offered.
 *    Cancel (`cancelBooking`) sends the same two Resend emails after the
 *    status flip: client “Shoot cancelled” (Scheduling link only — not
 *    modify that booking) and Billy “Booking cancelled”. Soft-fail mail.
 *    When `calendarEventId` is present, also DELETE the Work calendar event
 *    (same `writeCalendarId` as create). 403/404/auth is logged and does
 *    not roll back the cancel or emails. Missing event id skips quietly.
 * 6. Slot length is the **sum** of selected service minutes (Billy, 2026-09-20).
 *    Never longest-only. When services are known, offered times and calendar
 *    event end use that sum instead of {@link DEFAULT_SLOT_MINUTES}.
 * 7. Offer window (Billy, 2026-09-20): America/New_York start times from
 *    {@link DEFAULT_OPEN_HOUR} through {@link DEFAULT_CLOSE_HOUR} inclusive,
 *    on {@link DEFAULT_STEP_MINUTES}-minute steps. A 6:00pm start is offered
 *    even if the computed end runs past 6:00pm.
 */

/** Locked at 0 — live Maps ETA only, no extra minutes (Billy, 2026-09-20). */
export const TRAVEL_PAD_MINUTES = 0;
export const TRAVEL_PAD_MS = TRAVEL_PAD_MINUTES * 60 * 1000;

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_OPEN_HOUR = 10;
export const DEFAULT_CLOSE_HOUR = 18;
/** Fallback when no services are selected. */
export const DEFAULT_SLOT_MINUTES = 90;
export const DEFAULT_STEP_MINUTES = 15;
/** Fallback when env is unset. Runtime horizon is at least {@link DEFAULT_MAX_BOOKING_MONTHS}. */
export const DEFAULT_DAYS_AHEAD = 14;
export const DEFAULT_MIN_LEAD_MINUTES = 120;
export const DEFAULT_WEEK_DAYS = 7;
export const DEFAULT_MAX_BOOKING_MONTHS = 3;
