import { eq } from "drizzle-orm";
import { isUuid } from "@/lib/admin/ids";
import { primaryBookingContact } from "@/lib/client-contact";
import { db } from "@/lib/db";
import { bookings, clients } from "@/lib/db/schema";
import { directoryLogins } from "@/lib/user-portals";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";
import { confirmedTwilightDayTaken } from "./bookings";
import { calendarConfigured } from "./config";
import { parseShootAddress } from "./address";
import { calendarEventCopy } from "./calendar-event";
import { settleBookingIntegrations } from "./booking-integrations";
import { sendQueuedShootEmail, type QueuedShootEmailInput } from "./booking-email";
import { formatSyncIssue, type BookingSyncIssue } from "./booking-sync";
import {
  adminShootWindow,
  formatAdminShootPreview,
  parseAdminShootDate,
  parseAdminShootTime,
  shootOverlapWarning,
} from "./admin-time";
import { DEFAULT_TIMEZONE } from "./rules";
import {
  COMMERCIAL_VIDEO_HOURS_ERROR,
  commercialVideoHoursForServices,
  includesCommercialVideo,
  parseSchedulingService,
  parseSchedulingServices,
  SCHEDULING_SERVICES,
  type SchedulingService,
} from "./services";
import {
  includesTwilight,
  isTwilightBooking,
  isTwilightDayConflict,
  TWILIGHT_DAY_TAKEN,
  twilightAloneError,
  twilightClockForDateKey,
  twilightDateKey,
  twilightDayValue,
} from "./twilight";

export type BookingClientLogin = {
  userId?: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
};

export type BookingClientRecord = {
  id: string;
  inviteCode: string;
  displayName: string;
  company: string | null;
  primaryEmail: string;
  logins: BookingClientLogin[];
};

export type OverrideBookingSource = "admin-ui" | "agent";

export type OverrideBookingInput = {
  source: OverrideBookingSource;
  client: string;
  address: string;
  services: readonly string[];
  commercialHours?: number | null;
  date: string;
  time: string;
  notes?: string | null;
};

export type OverrideBookingSuccess = {
  ok: true;
  bookingId: string;
  client: { id: string; inviteCode: string; displayName: string };
  startsAt: string;
  startEt: string;
  timeZone: string;
  calendar: "written" | "failed" | "skipped";
  email: "sent" | "failed";
  overlapWarning: string | null;
};

export type OverrideBookingResult = OverrideBookingSuccess | { ok: false; error: string };

type InsertedBooking = {
  clientId: string;
  createdByUserId: string | null;
  address: string;
  services: SchedulingService[];
  commercialVideoHours: number | null;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  driveSecondsFromPrior: null;
  twilightDay: string | null;
};

export type OverrideBookingDeps = {
  listClients: () => Promise<BookingClientRecord[]>;
  listConfirmedIntervals: () => Promise<{ start: Date; end: Date }[]>;
  insertBooking: (row: InsertedBooking) => Promise<{ id: string } | null>;
  settle: typeof settleBookingIntegrations;
  calendarOn: () => boolean;
  timeZone?: string;
  /** Confirmed Twilight already stored on this Eastern date. Omitted in tests that do not book Twilight. */
  twilightDayTaken?: (dateKey: string) => Promise<boolean>;
};

function clientLabel(client: Pick<BookingClientRecord, "displayName" | "inviteCode" | "company">) {
  const company = client.company?.trim();
  return company
    ? `${client.displayName} (${client.inviteCode}, ${company})`
    : `${client.displayName} (${client.inviteCode})`;
}

function closeClientMatches(query: string, rows: readonly BookingClientRecord[]) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return rows
    .filter((client) => {
      const haystack = [client.displayName, client.company, client.inviteCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, 8);
}

export function resolveBookingClient(
  raw: string,
  rows: readonly BookingClientRecord[],
): { ok: true; client: BookingClientRecord } | { ok: false; error: string } {
  const query = raw.replace(/\s+/g, " ").trim();
  if (!query) return { ok: false, error: "Choose a client." };

  if (isUuid(query)) {
    const found = rows.find((client) => client.id.toLowerCase() === query.toLowerCase());
    if (!found) return { ok: false, error: "No client with that id." };
    return { ok: true, client: found };
  }

  const code = normalizeInviteCode(query);
  if (isInviteCode(code)) {
    const found = rows.find((client) => client.inviteCode.toUpperCase() === code);
    if (!found) return { ok: false, error: `No client with invite code ${code}.` };
    return { ok: true, client: found };
  }

  const name = query.toLowerCase();
  const named = rows.filter((client) => client.displayName.replace(/\s+/g, " ").trim().toLowerCase() === name);
  if (named.length === 1) return { ok: true, client: named[0]! };
  if (named.length > 1) {
    return {
      ok: false,
      error: `More than one client is named "${query}". Say which one: ${named.map(clientLabel).join("; ")}.`,
    };
  }

  const close = closeClientMatches(query, rows);
  const suffix = close.length > 0 ? ` Close matches: ${close.map(clientLabel).join("; ")}.` : "";
  return { ok: false, error: `No client matched "${query}".${suffix}` };
}

export function parseOverrideServices(
  raw: readonly string[],
): { ok: true; services: SchedulingService[] } | { ok: false; error: string } {
  const flat = raw.map((item) => item.trim()).filter(Boolean);
  if (flat.length === 0) return { ok: false, error: "Pick at least one service." };
  const unknown = flat.find((item) => !parseSchedulingService(item));
  if (unknown) {
    return {
      ok: false,
      error: `Unknown service "${unknown}". Use one of: ${SCHEDULING_SERVICES.join(", ")}.`,
    };
  }
  const services = parseSchedulingServices(flat);
  if (services.length === 0) return { ok: false, error: "Pick at least one service." };
  return { ok: true, services };
}

function bookingContact(client: BookingClientRecord) {
  return primaryBookingContact({
    primaryEmail: client.primaryEmail,
    logins: client.logins,
  });
}

export async function createOverrideBooking(
  input: OverrideBookingInput,
  deps: OverrideBookingDeps = defaultOverrideBookingDeps(),
): Promise<OverrideBookingResult> {
  if (input.source !== "admin-ui" && input.source !== "agent") {
    return { ok: false, error: "Unknown booking source." };
  }
  const timeZone = deps.timeZone ?? DEFAULT_TIMEZONE;
  const listed = await deps.listClients();
  const resolved = resolveBookingClient(input.client, listed);
  if (!resolved.ok) return resolved;

  const address = parseShootAddress(input.address);
  if (!address.ok) return address;

  const services = parseOverrideServices(input.services);
  if (!services.ok) return services;

  const commercialVideoHours = commercialVideoHoursForServices(services.services, input.commercialHours);
  if (includesCommercialVideo(services.services) && commercialVideoHours == null) {
    return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR };
  }
  const alone = twilightAloneError(services.services);
  if (alone) return { ok: false, error: alone };

  let timeText = input.time.trim();
  if (!timeText && isTwilightBooking(services.services)) {
    const sunset = twilightClockForDateKey(input.date, timeZone);
    if (!sunset) return { ok: false, error: "Enter a date as YYYY-MM-DD." };
    timeText = sunset;
  }

  if (!parseAdminShootDate(input.date)) return { ok: false, error: "Enter a date as YYYY-MM-DD." };
  const clock = parseAdminShootTime(timeText);
  if (!clock.ok) return clock;

  const window = adminShootWindow(input.date, timeText, services.services, timeZone, commercialVideoHours);
  if (!window) return { ok: false, error: "Could not read that time." };

  if (includesTwilight(services.services) && deps.twilightDayTaken) {
    const taken = await deps.twilightDayTaken(twilightDateKey(window.start, timeZone));
    if (taken) return { ok: false, error: TWILIGHT_DAY_TAKEN };
  }

  const notes = input.notes?.trim() || null;
  const jobs = await deps.listConfirmedIntervals();
  const overlapWarning = shootOverlapWarning(window, jobs);
  const client = resolved.client;
  const contact = bookingContact(client);
  const calendar = calendarEventCopy({
    firstName: contact?.login?.firstName,
    lastName: contact?.login?.lastName,
    displayName: client.displayName,
    email: contact?.email,
    phone: contact?.login?.phone,
    company: client.company,
    address: address.address,
    services: services.services,
    notes,
  });

  let inserted: { id: string } | null;
  try {
    inserted = await deps.insertBooking({
      clientId: client.id,
      createdByUserId: contact?.login?.userId ?? null,
      address: address.address,
      services: services.services,
      commercialVideoHours,
      startsAt: window.start,
      endsAt: window.end,
      notes,
      driveSecondsFromPrior: null,
      twilightDay: twilightDayValue(services.services, window.start, "confirmed", timeZone),
    });
  } catch (error) {
    if (isTwilightDayConflict(error)) return { ok: false, error: TWILIGHT_DAY_TAKEN };
    throw error;
  }
  if (!inserted) return { ok: false, error: "Booking could not be completed." };

  const calendarOn = deps.calendarOn();
  const settled = await deps.settle({
    action: "create",
    bookingId: inserted.id,
    calendarConfigured: calendarOn,
    calendarWrite: calendarOn
      ? {
          address: address.address,
          start: window.start,
          end: window.end,
          timeZone,
          summary: calendar.summary,
          description: calendar.description,
        }
      : undefined,
    email: {
      bookingId: inserted.id,
      clientEmail: contact?.email || client.primaryEmail,
      primaryEmail: client.primaryEmail,
      loginEmails: client.logins.map((row) => row.email),
      clientName: client.displayName,
      address: address.address,
      services: services.services,
      start: window.start,
      end: window.end,
      timeZone,
      notes,
    },
    // Admin UI and agent create_booking both skip Billy's New shoot mail.
    // Client confirmation and notes copies still send.
    skipOwnerNotify: true,
  });

  return {
    ok: true,
    bookingId: inserted.id,
    client: { id: client.id, inviteCode: client.inviteCode, displayName: client.displayName },
    startsAt: window.start.toISOString(),
    startEt: formatAdminShootPreview(window.start, timeZone),
    timeZone,
    calendar: calendarStatus(calendarOn, settled.issues, settled.calendarEventId),
    email: settled.issues.email ? "failed" : "sent",
    overlapWarning,
  };
}

export type QueuedBookingInput = {
  source: OverrideBookingSource;
  client: string;
  address: string;
  services: readonly string[];
  commercialHours?: number | null;
  notes?: string | null;
};

export type QueuedBookingSuccess = {
  ok: true;
  bookingId: string;
  client: { id: string; inviteCode: string; displayName: string };
  status: "queued";
  startsAt: null;
  endsAt: null;
  address: string;
  services: SchedulingService[];
  commercialVideoHours: number | null;
  notes: string | null;
  calendar: "skipped";
  email: "sent" | "failed";
};

export type QueuedBookingResult = QueuedBookingSuccess | { ok: false; error: string };

type InsertedQueuedBooking = {
  clientId: string;
  createdByUserId: string | null;
  address: string;
  services: SchedulingService[];
  commercialVideoHours: number | null;
  notes: string | null;
  status: "queued";
  startsAt: null;
  endsAt: null;
  calendarEventId: null;
};

export type QueuedBookingDeps = {
  listClients: () => Promise<BookingClientRecord[]>;
  insertQueuedBooking: (row: InsertedQueuedBooking) => Promise<{ id: string } | null>;
  sendHold: (input: QueuedShootEmailInput) => Promise<{ clientSent: boolean }>;
  saveEmailIssue: (bookingId: string, emailFailed: boolean) => Promise<void>;
};

/**
 * Create a queued shoot with no start or end. No calendar event and no Billy notify.
 * The client gets the hold subject, without a previous-time line, and Notes addresses are copied.
 */
export async function createQueuedBooking(
  input: QueuedBookingInput,
  deps: QueuedBookingDeps = defaultQueuedBookingDeps(),
): Promise<QueuedBookingResult> {
  if (input.source !== "admin-ui" && input.source !== "agent") {
    return { ok: false, error: "Unknown booking source." };
  }
  const listed = await deps.listClients();
  const resolved = resolveBookingClient(input.client, listed);
  if (!resolved.ok) return resolved;

  const address = parseShootAddress(input.address);
  if (!address.ok) return address;

  const services = parseOverrideServices(input.services);
  if (!services.ok) return services;

  const commercialVideoHours = commercialVideoHoursForServices(services.services, input.commercialHours);
  if (includesCommercialVideo(services.services) && commercialVideoHours == null) {
    return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR };
  }
  const alone = twilightAloneError(services.services);
  if (alone) return { ok: false, error: alone };

  const notes = input.notes?.trim() || null;
  const client = resolved.client;
  const contact = bookingContact(client);
  const inserted = await deps.insertQueuedBooking({
    clientId: client.id,
    createdByUserId: contact?.login?.userId ?? null,
    address: address.address,
    services: services.services,
    commercialVideoHours,
    notes,
    status: "queued",
    startsAt: null,
    endsAt: null,
    calendarEventId: null,
  });
  if (!inserted) return { ok: false, error: "Booking could not be completed." };

  let emailFailed = false;
  try {
    const sent = await deps.sendHold({
      clientEmail: contact?.email || client.primaryEmail,
      primaryEmail: client.primaryEmail,
      loginEmails: client.logins.map((row) => row.email),
      firstName: contact?.login?.firstName ?? null,
      clientName: client.displayName,
      address: address.address,
      notes,
    });
    emailFailed = !sent.clientSent;
  } catch (error) {
    console.error("queued shoot email failed", error);
    emailFailed = true;
  }

  try {
    await deps.saveEmailIssue(inserted.id, emailFailed);
  } catch (error) {
    console.error("queued booking sync issue save failed", error);
  }

  return {
    ok: true,
    bookingId: inserted.id,
    client: { id: client.id, inviteCode: client.inviteCode, displayName: client.displayName },
    status: "queued",
    startsAt: null,
    endsAt: null,
    address: address.address,
    services: services.services,
    commercialVideoHours,
    notes,
    calendar: "skipped",
    email: emailFailed ? "failed" : "sent",
  };
}

function calendarStatus(
  configured: boolean,
  issues: BookingSyncIssue,
  calendarEventId: string | null,
): OverrideBookingSuccess["calendar"] {
  if (!configured) return "skipped";
  if (issues.calendar || !calendarEventId) return "failed";
  return "written";
}

export function defaultOverrideBookingDeps(): OverrideBookingDeps {
  return {
    async listClients() {
      const [clientRows, loginRows] = await Promise.all([
        db.select().from(clients),
        directoryLogins(),
      ]);
      const logins = new Map<string, BookingClientLogin[]>();
      for (const login of loginRows) {
        const list = logins.get(login.clientId) ?? [];
        list.push({
          userId: login.userId,
          email: login.email,
          firstName: login.firstName,
          lastName: login.lastName,
          phone: login.phone,
          createdAt: login.createdAt,
        });
        logins.set(login.clientId, list);
      }
      return clientRows.map((client) => ({
        id: client.id,
        inviteCode: client.inviteCode,
        displayName: client.displayName,
        company: client.company,
        primaryEmail: client.primaryEmail,
        logins: logins.get(client.id) ?? [],
      }));
    },
    async listConfirmedIntervals() {
      const rows = await db
        .select({ start: bookings.startsAt, end: bookings.endsAt })
        .from(bookings)
        .where(eq(bookings.status, "confirmed"));
      return rows.flatMap((row) => (row.start && row.end ? [{ start: row.start, end: row.end }] : []));
    },
    async insertBooking(row) {
      const [created] = await db
        .insert(bookings)
        .values({
          clientId: row.clientId,
          createdByUserId: row.createdByUserId,
          address: row.address,
          services: row.services,
          commercialVideoHours: row.commercialVideoHours,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: "confirmed",
          notes: row.notes,
          accessCodes: null,
          calendarEventId: null,
          driveSecondsFromPrior: row.driveSecondsFromPrior,
          twilightDay: row.twilightDay,
        })
        .returning({ id: bookings.id });
      return created ?? null;
    },
    settle: settleBookingIntegrations,
    calendarOn: calendarConfigured,
    twilightDayTaken: (dateKey) => confirmedTwilightDayTaken(dateKey),
  };
}

export function defaultQueuedBookingDeps(): QueuedBookingDeps {
  return {
    listClients: defaultOverrideBookingDeps().listClients,
    async insertQueuedBooking(row) {
      const [created] = await db
        .insert(bookings)
        .values({
          clientId: row.clientId,
          createdByUserId: row.createdByUserId,
          address: row.address,
          services: row.services,
          commercialVideoHours: row.commercialVideoHours,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: row.status,
          notes: row.notes,
          accessCodes: null,
          calendarEventId: row.calendarEventId,
          driveSecondsFromPrior: null,
        })
        .returning({ id: bookings.id });
      return created ?? null;
    },
    async sendHold(input) {
      const sent = await sendQueuedShootEmail(input);
      return { clientSent: sent.client.sent };
    },
    async saveEmailIssue(bookingId, emailFailed) {
      await db
        .update(bookings)
        .set({
          syncIssue: formatSyncIssue({ calendar: false, email: emailFailed, alertFailed: false }),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId));
    },
  };
}
