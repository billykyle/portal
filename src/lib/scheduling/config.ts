import {
  DEFAULT_CLOSE_HOUR,
  DEFAULT_DAYS_AHEAD,
  DEFAULT_MIN_LEAD_MINUTES,
  DEFAULT_OPEN_HOUR,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_STEP_MINUTES,
  DEFAULT_TIMEZONE,
} from "./rules";

function envInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export type SchedulingHours = {
  timeZone: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  stepMinutes: number;
  daysAhead: number;
  minLeadMinutes: number;
};

export function schedulingHours(): SchedulingHours {
  return {
    timeZone: process.env.SCHEDULING_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    openHour: envInt("SCHEDULING_OPEN_HOUR", DEFAULT_OPEN_HOUR),
    closeHour: envInt("SCHEDULING_CLOSE_HOUR", DEFAULT_CLOSE_HOUR),
    slotMinutes: envInt("SCHEDULING_SLOT_MINUTES", DEFAULT_SLOT_MINUTES),
    stepMinutes: envInt("SCHEDULING_SLOT_STEP_MINUTES", DEFAULT_STEP_MINUTES),
    daysAhead: envInt("SCHEDULING_DAYS_AHEAD", DEFAULT_DAYS_AHEAD),
    minLeadMinutes: envInt("SCHEDULING_MIN_LEAD_MINUTES", DEFAULT_MIN_LEAD_MINUTES),
  };
}

export const WORK_CALENDAR_ID = "billy@atmosimagery.com";
export const PERSONAL_CALENDAR_ID = "bkyle015@gmail.com";

export type CalendarCredentials = {
  calendarIds: string[];
  writeCalendarId: string;
  clientEmail: string;
  privateKey: string;
};

const HOLIDAY_CALENDAR = /#holiday@|holiday@group\.v\.calendar\.google\.com/i;

export function isUsHolidayCalendar(id: string) {
  return HOLIDAY_CALENDAR.test(id.trim());
}

/**
 * Prefer `GOOGLE_CALENDAR_IDS` (comma-separated). Fall back to singular
 * `GOOGLE_CALENDAR_ID`. US Holidays calendars are dropped — never queried.
 */
export function parseCalendarIds(raw: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\n]/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of parts) {
    if (isUsHolidayCalendar(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

export function readCalendarIds(): string[] {
  const many = process.env.GOOGLE_CALENDAR_IDS?.trim();
  if (many) return parseCalendarIds(many);
  return parseCalendarIds(process.env.GOOGLE_CALENDAR_ID);
}

/**
 * Env hooks for Google Calendar (read free/busy + write events).
 *
 * Required together:
 * - `GOOGLE_CALENDAR_IDS` = `billy@atmosimagery.com,bkyle015@gmail.com`
 *   (work + personal). A slot is busy if either calendar is busy.
 *   Singular `GOOGLE_CALENDAR_ID` still works as a fallback.
 *   Do not include US Holidays.
 * - service account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`
 *   or `GOOGLE_CLIENT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_EMAIL`
 *     + `GOOGLE_PRIVATE_KEY` (PKCS8, `\n` escaped newlines are fine)
 *
 * Bookings are written to the first ID (work). Both calendars must be shared
 * with the service-account email.
 */
export function readCalendarCredentials(): CalendarCredentials | null {
  const calendarIds = readCalendarIds();
  if (calendarIds.length === 0) return null;

  let clientEmail =
    process.env.GOOGLE_CLIENT_EMAIL?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  let privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      clientEmail = clientEmail || String(parsed.client_email ?? "").trim();
      privateKey = privateKey || String(parsed.private_key ?? "").replace(/\\n/g, "\n").trim();
    } catch {
      return null;
    }
  }

  const writeCalendarId = calendarIds[0];
  if (!clientEmail || !privateKey.includes("BEGIN") || !writeCalendarId) return null;
  return { calendarIds, writeCalendarId, clientEmail, privateKey };
}

export function calendarConfigured() {
  return readCalendarCredentials() != null;
}

/**
 * Env hook for Maps (server-only). One key covers:
 * - Distance Matrix — live drive time
 * - Places Autocomplete + Place Details — book-form suggestions
 * - Address Validation — format a typed address when no suggestion was picked
 *
 * Empty = do not invent travel or addresses. The book form shows a clear
 * message instead of fake suggestions; slots that need travel are refused.
 */
export function mapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function driveTimeConfigured() {
  return Boolean(mapsApiKey());
}

export function placesConfigured() {
  return Boolean(mapsApiKey());
}

export type SchedulingIntegrations = {
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
  placesConfigured: boolean;
};

export function schedulingIntegrations(): SchedulingIntegrations {
  return {
    calendarConfigured: calendarConfigured(),
    driveTimeConfigured: driveTimeConfigured(),
    placesConfigured: placesConfigured(),
  };
}
