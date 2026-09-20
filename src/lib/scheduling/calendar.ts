import { readCalendarCredentials } from "./config";
import { getCalendarAccessToken } from "./google-auth";
import type { Interval } from "./intervals";
import type { TravelJob } from "./travel";
import { addCalendarDays, utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";

function calendarUrl(calendarId: string, suffix: string) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${suffix}`;
}

/**
 * Google `freeBusy` rejects a single query longer than ~3 months
 * (`timeRangeTooLong`, HTTP 400). The bookable horizon is 3 calendar months
 * plus lead/travel padding, so requests must be split. 60 days leaves room
 * if Google tightens the undocumented cap.
 */
export const FREEBUSY_MAX_MS = 60 * 24 * 60 * 60 * 1000;

type GoogleErrorBody = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

export function parseCalendarApiError(text: string): string {
  try {
    const body = JSON.parse(text) as GoogleErrorBody;
    const reason = body.error?.errors?.[0]?.reason;
    const message = body.error?.message;
    if (reason && message && reason !== message) return `${reason}: ${message}`;
    return message || reason || "";
  } catch {
    return text.trim().slice(0, 200);
  }
}

export function formatCalendarHttpError(status: number, bodyText: string, label: string): string {
  const detail = parseCalendarApiError(bodyText);
  return detail ? `${label} ${status} (${detail})` : `${label} ${status}`;
}

async function throwCalendarHttpError(res: Response, label: string): Promise<never> {
  const text = await res.text();
  throw new Error(formatCalendarHttpError(res.status, text, label));
}

/** Split a lookup window into adjacent chunks no longer than `maxMs`. */
export function splitQueryWindows(range: Interval, maxMs = FREEBUSY_MAX_MS): Interval[] {
  if (range.end.getTime() <= range.start.getTime()) return [];
  if (maxMs <= 0) return [range];
  const windows: Interval[] = [];
  let start = range.start;
  while (start.getTime() < range.end.getTime()) {
    const chunkEndMs = Math.min(start.getTime() + maxMs, range.end.getTime());
    windows.push({ start, end: new Date(chunkEndMs) });
    start = new Date(chunkEndMs);
  }
  return windows;
}

type GoogleDate = { dateTime?: string; date?: string; timeZone?: string };

function parseGoogleInterval(start: GoogleDate | undefined, end: GoogleDate | undefined, timeZone: string): Interval | null {
  if (!start || !end) return null;
  if (start.dateTime && end.dateTime) {
    const from = new Date(start.dateTime);
    const to = new Date(end.dateTime);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return null;
    return { start: from, end: to };
  }
  if (start.date && end.date) {
    const [sy, sm, sd] = start.date.split("-").map(Number);
    const [ey, em, ed] = end.date.split("-").map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) return null;
    return {
      start: zonedDateTimeToUtc(timeZone, { year: sy, month: sm, day: sd, hour: 0, minute: 0 }),
      end: zonedDateTimeToUtc(timeZone, { year: ey, month: em, day: ed, hour: 0, minute: 0 }),
    };
  }
  return null;
}

export async function fetchCalendarBusy(range: Interval, timeZone: string): Promise<Interval[]> {
  const creds = readCalendarCredentials();
  if (!creds) return [];
  if (range.end.getTime() <= range.start.getTime()) {
    throw new Error("Google Calendar free/busy range is empty.");
  }
  const token = await getCalendarAccessToken(creds.auth);
  const windows = splitQueryWindows(range);
  const batches = await Promise.all(
    windows.map((window) => fetchFreeBusyWindow(token, creds.calendarIds, window, timeZone)),
  );
  return batches.flat();
}

async function fetchFreeBusyWindow(
  token: string,
  calendarIds: string[],
  range: Interval,
  timeZone: string,
): Promise<Interval[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      timeZone,
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Google Calendar free/busy");
  }
  const body = (await res.json()) as {
    calendars?: Record<string, FreeBusyCalendar>;
  };
  return collectFreeBusyIntervals(body.calendars, calendarIds);
}

type FreeBusyCalendar = {
  busy?: Array<{ start?: string; end?: string }>;
  errors?: unknown[];
};

function findReturnedCalendar(calendars: Record<string, FreeBusyCalendar> | undefined, id: string) {
  if (!calendars) return undefined;
  if (calendars[id]) return calendars[id];
  const lower = id.toLowerCase();
  for (const [key, value] of Object.entries(calendars)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Union busy blocks from every requested calendar. A slot is busy if either
 * calendar is busy. Missing or erroring calendars fail closed — never treat
 * an unread calendar as free.
 */
export function collectFreeBusyIntervals(
  calendars: Record<string, FreeBusyCalendar> | undefined,
  calendarIds: string[],
): Interval[] {
  const out: Interval[] = [];
  for (const id of calendarIds) {
    const calendar = findReturnedCalendar(calendars, id);
    if (!calendar) {
      throw new Error(`Google Calendar free/busy did not return ${id}.`);
    }
    if (calendar.errors && calendar.errors.length > 0) {
      const detail = calendar.errors
        .map((err) => {
          if (err && typeof err === "object" && "reason" in err) {
            return String((err as { reason?: unknown }).reason ?? "error");
          }
          return "error";
        })
        .join(", ");
      throw new Error(`Google Calendar free/busy failed for ${id} (${detail}).`);
    }
    for (const block of calendar.busy ?? []) {
      const start = new Date(String(block.start ?? ""));
      const end = new Date(String(block.end ?? ""));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) continue;
      out.push({ start, end });
    }
  }
  return out;
}

export async function fetchCalendarJobs(range: Interval, timeZone: string): Promise<TravelJob[]> {
  const creds = readCalendarCredentials();
  if (!creds) return [];
  const token = await getCalendarAccessToken(creds.auth);
  const batches = await Promise.all(
    creds.calendarIds.map((calendarId) => fetchCalendarJobsForId(token, calendarId, range, timeZone)),
  );
  return batches.flat();
}

async function fetchCalendarJobsForId(
  token: string,
  calendarId: string,
  range: Interval,
  timeZone: string,
): Promise<TravelJob[]> {
  const url = new URL(calendarUrl(calendarId, "/events"));
  url.searchParams.set("timeMin", range.start.toISOString());
  url.searchParams.set("timeMax", range.end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, `Google Calendar events for ${calendarId}`);
  }
  const body = (await res.json()) as {
    items?: Array<{ start?: GoogleDate; end?: GoogleDate; location?: string; status?: string }>;
  };
  const jobs: TravelJob[] = [];
  for (const item of body.items ?? []) {
    if (item.status === "cancelled") continue;
    const interval = parseGoogleInterval(item.start, item.end, timeZone);
    if (!interval) continue;
    const location = item.location?.trim() || null;
    jobs.push({ ...interval, address: location });
  }
  return jobs;
}

export type CalendarWriteInput = {
  address: string;
  start: Date;
  end: Date;
  timeZone: string;
  summary: string;
  description?: string;
};

/**
 * Insert a booking on the Work calendar (`writeCalendarId`).
 *
 * Live create needs **Make changes to events** (or domain-wide delegation).
 * Workspace for atmosimagery.com currently blocks granting that to the
 * external `portal-scheduling@…` service account — only See details is
 * allowed, so free/busy works and insert returns 403 `requiredAccessLevel`.
 * A Workspace Admin must allow external calendar edit sharing before this
 * can succeed. Book shoot must still confirm when it throws.
 */
export async function writeCalendarBooking(input: CalendarWriteInput): Promise<string | null> {
  const creds = readCalendarCredentials();
  if (!creds) return null;
  const token = await getCalendarAccessToken(creds.auth);
  const res = await fetch(calendarUrl(creds.writeCalendarId, "/events"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.summary,
      location: input.address,
      description: input.description ?? "",
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    }),
  });
  if (!res.ok) {
    await throwCalendarHttpError(res, "Google Calendar write");
  }
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/**
 * Attempt a Calendar insert without failing Book shoot.
 * Success returns the event id; any error (including 403 writer access)
 * is logged and returns null so `calendarEventId` stays empty.
 */
export async function settleCalendarWrite(
  write: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await write();
  } catch (error) {
    console.error("Google Calendar write failed; booking still confirmed", error);
    return null;
  }
}

export async function tryWriteCalendarBooking(input: CalendarWriteInput): Promise<string | null> {
  return settleCalendarWrite(() => writeCalendarBooking(input));
}

/**
 * Replace an existing Work calendar event. 404 falls back to insert so a
 * stale `calendarEventId` still gets a live event when writer access works.
 */
export async function updateCalendarBooking(
  eventId: string,
  input: CalendarWriteInput,
): Promise<string | null> {
  const creds = readCalendarCredentials();
  if (!creds) return null;
  const token = await getCalendarAccessToken(creds.auth);
  const res = await fetch(calendarUrl(creds.writeCalendarId, `/events/${encodeURIComponent(eventId)}`), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.summary,
      location: input.address,
      description: input.description ?? "",
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    }),
  });
  if (res.status === 404) {
    return writeCalendarBooking(input);
  }
  if (!res.ok) {
    await throwCalendarHttpError(res, "Google Calendar write");
  }
  const body = (await res.json()) as { id?: string };
  return body.id ?? eventId;
}

/** Update the existing event, or insert when the booking never landed on Calendar. */
export async function replaceCalendarBooking(
  eventId: string | null | undefined,
  input: CalendarWriteInput,
): Promise<string | null> {
  if (eventId) return updateCalendarBooking(eventId, input);
  return writeCalendarBooking(input);
}

export async function tryReplaceCalendarBooking(
  eventId: string | null | undefined,
  input: CalendarWriteInput,
): Promise<string | null> {
  return settleCalendarWrite(() => replaceCalendarBooking(eventId, input));
}

/**
 * Delete a booking from the Work calendar (`writeCalendarId`).
 * Same calendar create/update write to. 204/200 succeed; anything else throws
 * so the cancel action can soft-fail without rolling back status or mail.
 */
export async function deleteCalendarBooking(eventId: string): Promise<boolean> {
  const creds = readCalendarCredentials();
  if (!creds) return false;
  const token = await getCalendarAccessToken(creds.auth);
  const res = await fetch(calendarUrl(creds.writeCalendarId, `/events/${encodeURIComponent(eventId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204 || res.ok) return true;
  await throwCalendarHttpError(res, "Google Calendar delete");
}

/**
 * Attempt a Calendar delete without failing cancel.
 * Success returns true; 403/404/auth (or any other error) is logged and
 * returns false so the booking stays cancelled and emails still go out.
 */
export async function settleCalendarDelete(del: () => Promise<boolean>): Promise<boolean> {
  try {
    return await del();
  } catch (error) {
    console.error("Google Calendar delete failed; booking still cancelled", error);
    return false;
  }
}

/** Skip quietly when create never stored an event id. */
export function hasStoredCalendarEventId(eventId: string | null | undefined): eventId is string {
  return Boolean(eventId?.trim());
}

export async function tryDeleteCalendarBooking(eventId: string | null | undefined): Promise<boolean> {
  if (!hasStoredCalendarEventId(eventId)) return false;
  return settleCalendarDelete(() => deleteCalendarBooking(eventId));
}

/** Window used when asking Calendar for free/busy around the offered days. */
export function availabilityWindow(now: Date, daysAhead: number, timeZone: string): Interval {
  const today = utcToZonedParts(now, timeZone);
  const endDate = addCalendarDays(today, daysAhead + 2);
  return {
    start: new Date(now.getTime() - 36 * 60 * 60 * 1000),
    end: zonedDateTimeToUtc(timeZone, { ...endDate, hour: 23, minute: 59 }),
  };
}
