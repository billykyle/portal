import { SignJWT, importPKCS8 } from "jose";
import { readCalendarCredentials, type CalendarCredentials } from "./config";
import type { Interval } from "./intervals";
import type { TravelJob } from "./travel";
import { addCalendarDays, zonedDateTimeToUtc } from "./zoned-time";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

async function accessToken(creds: CalendarCredentials) {
  const key = await importPKCS8(creds.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: CALENDAR_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar token ${res.status}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Google Calendar token response was empty.");
  }
  return body.access_token;
}

function calendarUrl(calendarId: string, suffix: string) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${suffix}`;
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
  const token = await accessToken(creds);
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
      items: creds.calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar free/busy ${res.status}`);
  }
  const body = (await res.json()) as {
    calendars?: Record<string, FreeBusyCalendar>;
  };
  return collectFreeBusyIntervals(body.calendars, creds.calendarIds);
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
      throw new Error(`Google Calendar free/busy failed for ${id}.`);
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
  const token = await accessToken(creds);
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
    throw new Error(`Google Calendar events ${res.status} for ${calendarId}`);
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

export async function writeCalendarBooking(input: {
  address: string;
  start: Date;
  end: Date;
  timeZone: string;
  summary: string;
  description?: string;
}): Promise<string | null> {
  const creds = readCalendarCredentials();
  if (!creds) return null;
  const token = await accessToken(creds);
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
    throw new Error(`Google Calendar write ${res.status}`);
  }
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/** Window used when asking Calendar for free/busy around the offered days. */
export function availabilityWindow(now: Date, daysAhead: number, timeZone: string): Interval {
  const endDate = addCalendarDays(
    {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
    },
    daysAhead + 2,
  );
  return {
    start: new Date(now.getTime() - 36 * 60 * 60 * 1000),
    end: zonedDateTimeToUtc(timeZone, { ...endDate, hour: 23, minute: 59 }),
  };
}
