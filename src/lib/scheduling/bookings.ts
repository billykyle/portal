import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, clients } from "@/lib/db/schema";
import { adminBookingNotices } from "./booking-sync";
import type { Interval } from "./intervals";
import type { TravelJob } from "./travel";

export async function loadConfirmedPortalJobs(options?: {
  excludeBookingId?: string | null;
}): Promise<TravelJob[]> {
  const rows = await db.select().from(bookings).where(eq(bookings.status, "confirmed"));
  return rows.flatMap((row) => {
    if (!row.startsAt || !row.endsAt) return [];
    if (options?.excludeBookingId && row.id === options.excludeBookingId) return [];
    return [{ start: row.startsAt, end: row.endsAt, address: row.address }];
  });
}

const BOOKING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getBookingById(bookingId: string) {
  if (!bookingId || !BOOKING_ID_RE.test(bookingId)) return null;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return booking ?? null;
}

export async function getClientBooking(clientId: string, bookingId: string) {
  if (!bookingId || !BOOKING_ID_RE.test(bookingId)) return null;
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, clientId)))
    .limit(1);
  return booking ?? null;
}

/** Owner may edit a confirmed shoot that has not started. */
export function canModifyBooking(
  booking: { status: string; startsAt: Date | null; clientId: string },
  clientId: string,
  now = new Date(),
) {
  return (
    booking.status === "confirmed" &&
    booking.clientId === clientId &&
    booking.startsAt != null &&
    booking.startsAt.getTime() > now.getTime()
  );
}

/** Admin may edit any confirmed shoot, including one that has already started. */
export function canAdminModifyBooking(
  booking: { status: string; startsAt?: Date | null },
  _now = new Date(),
) {
  return booking.status === "confirmed";
}

/** Upcoming confirmed shoots can wait in the client's queue with no start time. */
export function canQueueUpcomingBooking(
  booking: { status: string; startsAt: Date | null },
  now = new Date(),
) {
  return (
    booking.status === "confirmed" &&
    booking.startsAt != null &&
    booking.startsAt.getTime() > now.getTime()
  );
}

/** Client may edit an upcoming shoot or pick a time for one already in their queue. */
export function canClientOpenBooking(
  booking: { status: string; startsAt: Date | null; clientId: string },
  clientId: string,
  now = new Date(),
) {
  if (booking.clientId !== clientId) return false;
  if (booking.status === "queued") return true;
  return canModifyBooking(booking, clientId, now);
}

/** Admin may edit a confirmed shoot or schedule one that is waiting in the queue. */
export function canAdminOpenBooking(booking: { status: string }) {
  return booking.status === "confirmed" || booking.status === "queued";
}

export function splitActiveBookings<T extends { status: string; startsAt: Date | null }>(
  rows: T[],
  now = Date.now(),
) {
  const queued: T[] = [];
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const row of rows) {
    if (row.status === "queued") {
      queued.push(row);
      continue;
    }
    if (row.startsAt == null) continue;
    if (row.startsAt.getTime() >= now) upcoming.push(row);
    else past.push(row);
  }
  return { queued, upcoming, past };
}

export async function loadConfirmedPortalBusy(): Promise<Interval[]> {
  const jobs = await loadConfirmedPortalJobs();
  return jobs.map((job) => ({ start: job.start, end: job.end }));
}

/** Soft admin notice when a confirmed booking never landed on Work calendar. */
export function adminCalendarGapNotice(booking: {
  status: string;
  calendarEventId?: string | null;
  syncIssue?: string | null;
}): string | null {
  return adminBookingNotices(booking)[0] ?? null;
}

export async function listClientQueuedBookings(clientId: string) {
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.clientId, clientId), eq(bookings.status, "queued")))
    .orderBy(desc(bookings.updatedAt));
}

export async function listClientUpcomingBookings(clientId: string) {
  return db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.clientId, clientId), eq(bookings.status, "confirmed"), gte(bookings.startsAt, new Date())),
    )
    .orderBy(asc(bookings.startsAt));
}

export async function listAdminBookings() {
  return db
    .select({
      id: bookings.id,
      address: bookings.address,
      service: bookings.service,
      services: bookings.services,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      notes: bookings.notes,
      accessCodes: bookings.accessCodes,
      calendarEventId: bookings.calendarEventId,
      syncIssue: bookings.syncIssue,
      clientId: bookings.clientId,
      clientName: clients.displayName,
      inviteCode: clients.inviteCode,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(ne(bookings.status, "cancelled"))
    .orderBy(asc(bookings.startsAt));
}

export async function listClientBookingsAdmin(clientId: string) {
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.clientId, clientId))
    .orderBy(asc(bookings.startsAt));
}
