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

export type CalendarCredentials = {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * Env hooks for Google Calendar (read free/busy + write events).
 *
 * Required together:
 * - `GOOGLE_CALENDAR_ID`
 * - service account JSON in `GOOGLE_SERVICE_ACCOUNT_JSON`
 *   or `GOOGLE_CLIENT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_EMAIL`
 *     + `GOOGLE_PRIVATE_KEY` (PKCS8, `\n` escaped newlines are fine)
 */
export function readCalendarCredentials(): CalendarCredentials | null {
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
  if (!calendarId) return null;

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

  if (!clientEmail || !privateKey.includes("BEGIN")) return null;
  return { calendarId, clientEmail, privateKey };
}

export function calendarConfigured() {
  return readCalendarCredentials() != null;
}

/** Env hook for live drive time. Empty = do not invent travel; refuse slots that need it. */
export function mapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function driveTimeConfigured() {
  return Boolean(mapsApiKey());
}

export type SchedulingIntegrations = {
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
};

export function schedulingIntegrations(): SchedulingIntegrations {
  return {
    calendarConfigured: calendarConfigured(),
    driveTimeConfigured: driveTimeConfigured(),
  };
}
