import { asc, eq } from "drizzle-orm";
import { isUuid } from "@/lib/admin/ids";
import { db } from "@/lib/db";
import { bookings, clients, users } from "@/lib/db/schema";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";
import { calendarConfigured } from "./config";
import { parseShootAddress } from "./address";
import { calendarEventCopy } from "./calendar-event";
import { settleBookingIntegrations } from "./booking-integrations";
import type { BookingSyncIssue } from "./booking-sync";
import {
  adminShootWindow,
  formatAdminShootPreview,
  parseAdminShootDate,
  parseAdminShootTime,
  shootOverlapWarning,
} from "./admin-time";
import { DEFAULT_TIMEZONE } from "./rules";
import {
  parseSchedulingService,
  parseSchedulingServices,
  SCHEDULING_SERVICES,
  type SchedulingService,
} from "./services";

export type BookingClientLogin = {
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
  address: string;
  services: SchedulingService[];
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  driveSecondsFromPrior: null;
};

export type OverrideBookingDeps = {
  listClients: () => Promise<BookingClientRecord[]>;
  listConfirmedIntervals: () => Promise<{ start: Date; end: Date }[]>;
  insertBooking: (row: InsertedBooking) => Promise<{ id: string } | null>;
  settle: typeof settleBookingIntegrations;
  calendarOn: () => boolean;
  timeZone?: string;
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

function earliestLogin(client: BookingClientRecord) {
  return [...client.logins].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null;
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

  if (!parseAdminShootDate(input.date)) return { ok: false, error: "Enter a date as YYYY-MM-DD." };
  const clock = parseAdminShootTime(input.time);
  if (!clock.ok) return clock;

  const window = adminShootWindow(input.date, input.time, services.services, timeZone);
  if (!window) return { ok: false, error: "Could not read that time." };

  const notes = input.notes?.trim() || null;
  const jobs = await deps.listConfirmedIntervals();
  const overlapWarning = shootOverlapWarning(window, jobs);
  const client = resolved.client;
  const login = earliestLogin(client);
  const calendar = calendarEventCopy({
    firstName: login?.firstName,
    lastName: login?.lastName,
    displayName: client.displayName,
    email: login?.email,
    phone: login?.phone,
    company: client.company,
    address: address.address,
    services: services.services,
    notes,
  });

  const inserted = await deps.insertBooking({
    clientId: client.id,
    address: address.address,
    services: services.services,
    startsAt: window.start,
    endsAt: window.end,
    notes,
    driveSecondsFromPrior: null,
  });
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
      clientEmail: login?.email || client.primaryEmail,
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
        db
          .select({
            clientId: users.clientId,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(asc(users.createdAt)),
      ]);
      const logins = new Map<string, BookingClientLogin[]>();
      for (const login of loginRows) {
        const list = logins.get(login.clientId) ?? [];
        list.push({
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
      return rows;
    },
    async insertBooking(row) {
      const [created] = await db
        .insert(bookings)
        .values({
          clientId: row.clientId,
          createdByUserId: null,
          address: row.address,
          services: row.services,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: "confirmed",
          notes: row.notes,
          accessCodes: null,
          calendarEventId: null,
          driveSecondsFromPrior: row.driveSecondsFromPrior,
        })
        .returning({ id: bookings.id });
      return created ?? null;
    },
    settle: settleBookingIntegrations,
    calendarOn: calendarConfigured,
  };
}
