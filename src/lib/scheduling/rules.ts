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
 *    that write hook is live. Event title is
 *    `{First Last} - {service initials}` using user first+last (displayName
 *    only if those are missing — never company). Initials are P, V, V., AP, 360,
 *    Podcast, CV, and M in catalog order, deduped, so industry names stay out of
 *    the title. Title parens are only a lockbox: a short access code typed in
 *    notes. Sentences and other notes stay out of the title. Omit the parens
 *    when notes are empty or are not a lockbox. Do not use accessCodes
 *    for the title. Description is a labeled client list ending with
 *    `Booked through your portal`. Location stays the shoot address. A
 *    Calendar write failure (including 403 writer access) is logged and
 *    leaves `calendarEventId` null. The shoot stays saved and the client
 *    sees a confirmation that calendar sync failed (Billy is alerted).
 *    Singular `GOOGLE_CALENDAR_ID` is still accepted.
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
 *    (no CC/BCC): client confirmation to the booker's login email
 *    (`users.email`, else the session email), and a
 *    `New shoot: …` alert to Billy (`billy@billyhere.com` /
 *    `BOOKING_NOTIFY_EMAIL`) with Pepper instructions not to add the shoot
 *    to his calendar. Do not require Pepper. Never roll back the calendar
 *    event or DB insert if mail or Calendar write fails. Partial success
 *    must be honest on the confirmation page (calendar vs email). Billy
 *    gets `Portal booking sync issue` when Calendar or Resend fails; if
 *    that alert also fails, log `PORTAL_BOOKING_SYNC_ALERT` and store
 *    `sync_issue` on the booking. Never send client mail to a NAS
 *    `@pending.local` placeholder. Fall back to the client's real login
 *    emails; if none exist, skip the client send and raise that same alert.
 *    Modify (`updateBooking`) uses the same
 *    two-send + Calendar pattern, excluding the
 *    booking being edited from availability so its own slot stays offered.
 *    Modify always keeps the original start selectable and pre-selected,
 *    even when added services make that start overlap another busy block.
 *    Cancel (`cancelBooking`) sends the same two Resend emails after the
 *    status flip: client “Shoot cancelled” (Scheduling link only — not
 *    modify that booking) and Billy “Shoot cancelled”. Mail and Calendar
 *    delete failures use the same honest confirm + Billy alert path.
 *    Cancel still sends both branded cancel emails when Calendar delete
 *    fails; the sync-issue alert is additive. Client cancel always
 *    redirects to `/scheduling/confirmed/{id}?cancelled=1` so the confirm
 *    page refreshes even when Cancel was clicked on that same URL.
 *    The client then lands on the confirmation page for that booking in
 *    cancelled state (same layout; no Modify/Cancel). Client confirm and
 *    update emails include Add to calendar (ICS attachment + signed ICS
 *    URL, plus a Google Calendar template link). Cancelled client mail
 *    omits that CTA. Billy’s notify emails never include it.
 *    Other addresses in the current Notes get a separate send of that same
 *    client email (deduped against the booker). Billy's notify and
 *    sync-issue mail are not copied to them. A lockbox code in Notes is
 *    the only notes text copied into the calendar title, exactly as typed.
 *    When `calendarEventId` is present, also DELETE the Work calendar event
 *    (same `writeCalendarId` as create). 403/404/auth is logged and does
 *    not roll back the cancel or emails. Missing event id skips quietly.
 *    Queue (`queueBooking` and the agent `queue_booking` tool) moves an
 *    upcoming confirmed shoot to status `queued` with no start or end.
 *    The Google Calendar event is deleted and that time is released.
 *    Address, services, notes, and access codes stay. The client gets
 *    “Your shoot is on hold.” Notes addresses are copied. Billy is not.
 *    Scheduling lists Queue above Upcoming only when that client has
 *    queued shoots. Picking a time later books it the normal way.
 * 6. Slot length is the **sum** of selected service minutes (Billy, 2026-09-20).
 *    Never longest-only. When services are known, offered times and calendar
 *    event end use that sum instead of {@link DEFAULT_SLOT_MINUTES}.
 *    Commercial video has no fixed minutes (Billy, 2026-09-30). The client
 *    or admin chooses 1 through 8 whole hours, and that length is added to
 *    the sum. Without a chosen length, no times are offered.
 *    Social Media Video is Monthly Batch Video (60 minutes) or Long Form
 *    Content Creation (120 minutes). Only one may be selected. The stored
 *    id records which option was picked. That block, alone or combined,
 *    must end at or before 6:00pm. Meeting is a 30 min appointment or a
 *    1 hour appointment. Only one may be selected, and it follows the
 *    same 6:00pm start rule as Photography.
 * 7. Offer window (Billy, 2026-09-20): America/New_York start times from
 *    {@link DEFAULT_OPEN_HOUR} through {@link DEFAULT_CLOSE_HOUR} inclusive,
 *    on {@link DEFAULT_STEP_MINUTES}-minute steps. A 6:00pm start is offered
 *    even if the computed end runs past 6:00pm. Commercial video and Social
 *    Media Video, alone or combined with other services, must end at or
 *    before 6:00pm, so a longer block has fewer start times. Other services
 *    still offer a 6:00pm start. Construction (Photography, Video, or any
 *    Construction option, including both together) is the exception
 *    (Billy, 2026-10-03): starts at any time of day, including overnight,
 *    with no 9am–6pm window and no 6pm end. A mix with another industry
 *    keeps the daytime window. Same-day and Tuesday/Saturday/Sunday still
 *    apply. A Construction slot that overlaps a calendar event is not offered
 *    to clients.
 * 8. Bookable days (Billy, 2026-09-21): no same-day bookings in
 *    America/New_York, and never Tuesday, Saturday, or Sunday. Allowed new
 *    starts are Monday, Wednesday, Thursday, Friday — and never today.
 *    Today and blocked weekdays still appear in the times list / week range
 *    as **no time available**. Modify always keeps the existing start
 *    selectable (even if that day is today or a blocked weekday) and does
 *    not invent other slots on a blocked day. Create/update reject a new
 *    start on a blocked day so the API cannot bypass the list.
 */

/** Locked at 0 — live Maps ETA only, no extra minutes (Billy, 2026-09-20). */
export const TRAVEL_PAD_MINUTES = 0;
export const TRAVEL_PAD_MS = TRAVEL_PAD_MINUTES * 60 * 1000;

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_OPEN_HOUR = 9;
export const DEFAULT_CLOSE_HOUR = 18;
/** Fallback when no services are selected. */
export const DEFAULT_SLOT_MINUTES = 90;
export const DEFAULT_STEP_MINUTES = 15;
/** Fallback when env is unset. Runtime horizon is at least {@link DEFAULT_MAX_BOOKING_MONTHS}. */
export const DEFAULT_DAYS_AHEAD = 14;
export const DEFAULT_MIN_LEAD_MINUTES = 120;
export const DEFAULT_WEEK_DAYS = 7;
export const DEFAULT_MAX_BOOKING_MONTHS = 3;

/**
 * JS `Date#getUTCDay` values that never take new bookings:
 * Sunday (0), Tuesday (2), Saturday (6).
 */
export const BLOCKED_BOOKING_WEEKDAYS = [0, 2, 6] as const;
/** Monday, Wednesday, Thursday, Friday. */
export const BOOKABLE_WEEKDAYS = [1, 3, 4, 5] as const;
