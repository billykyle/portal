import { and, asc, eq, gte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, clients } from "@/lib/db/schema";
import type { Interval } from "./intervals";
import type { TravelJob } from "./travel";

export async function loadConfirmedPortalJobs(): Promise<TravelJob[]> {
  const rows = await db.select().from(bookings).where(eq(bookings.status, "confirmed"));
  return rows.map((row) => ({
    start: row.startsAt,
    end: row.endsAt,
    address: row.address,
  }));
}

export async function loadConfirmedPortalBusy(): Promise<Interval[]> {
  const jobs = await loadConfirmedPortalJobs();
  return jobs.map((job) => ({ start: job.start, end: job.end }));
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
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      notes: bookings.notes,
      accessCodes: bookings.accessCodes,
      calendarEventId: bookings.calendarEventId,
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
