"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients } from "@/lib/db/schema";
import { CLIENT_SCHEDULING } from "@/lib/routes";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  slotStillOffered,
} from "@/lib/scheduling/availability";
import { loadConfirmedPortalJobs } from "@/lib/scheduling/bookings";
import { writeCalendarBooking } from "@/lib/scheduling/calendar";
import { schedulingHours } from "@/lib/scheduling/config";
import { parseSchedulingService } from "@/lib/scheduling/services";

function schedulingUrl(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${CLIENT_SCHEDULING}?${qs}` : CLIENT_SCHEDULING;
}

export async function createBooking(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const address = String(formData.get("address") ?? "");
  const service = parseSchedulingService(String(formData.get("service") ?? ""));
  const slot = String(formData.get("slot") ?? "");
  const [startIso, endIso] = slot.split("|");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const accessCodes = String(formData.get("accessCodes") ?? "").trim() || null;
  if (!service) {
    redirect(schedulingUrl({ address, error: "Pick a service." }));
  }
  if (!startIso || !endIso) {
    redirect(schedulingUrl({ address, service, error: "Pick a time." }));
  }

  const portalJobs = await loadConfirmedPortalJobs();
  const sources = await loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
  if ("error" in sources) {
    redirect(schedulingUrl({ address, service, error: sources.error }));
  }
  const availability = await offerSlotsForAddress(address, sources);
  if (availability.error) {
    redirect(schedulingUrl({ service, error: availability.error }));
  }
  if (!slotStillOffered(availability, startIso, endIso)) {
    redirect(
      schedulingUrl({
        address: availability.address,
        service,
        error: "That time is no longer available. Pick another.",
      }),
    );
  }

  const start = new Date(startIso);
  const end = new Date(endIso);
  const offered = availability.slots.find((slot) => slot.start === startIso && slot.end === endIso);
  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);
  const hours = schedulingHours();

  let calendarEventId: string | null = null;
  if (availability.calendarConfigured) {
    try {
      calendarEventId = await writeCalendarBooking({
        address: availability.address,
        start,
        end,
        timeZone: hours.timeZone,
        summary: `${service} — ${client?.displayName ?? session.email}`,
        description: [service, notes, accessCodes ? `Access: ${accessCodes}` : ""].filter(Boolean).join("\n"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Calendar write failed.";
      redirect(schedulingUrl({ address: availability.address, service, error: message }));
    }
  }

  await db.insert(bookings).values({
    clientId: session.clientId,
    createdByUserId: session.userId,
    address: availability.address,
    service,
    startsAt: start,
    endsAt: end,
    status: "confirmed",
    notes,
    accessCodes,
    calendarEventId,
    driveSecondsFromPrior: offered?.driveSecondsFromPrior ?? null,
  });

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath("/admin/bookings");
  redirect(schedulingUrl({ booked: "1" }));
}

export async function cancelBooking(formData: FormData) {
  const admin = await getAdminSession();
  const session = await getSession();
  if (!admin && !session) {
    redirect("/");
  }
  await ensureDb();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) {
    redirect(admin ? "/admin/bookings?error=Booking%20is%20required." : schedulingUrl({ error: "Booking is required." }));
  }
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) {
    redirect(admin ? "/admin/bookings?error=Booking%20was%20not%20found." : schedulingUrl({ error: "Booking was not found." }));
  }
  if (!admin && booking.clientId !== session?.clientId) {
    redirect(schedulingUrl({ error: "Booking was not found." }));
  }
  if (booking.status === "cancelled") {
    redirect(admin ? "/admin/bookings" : CLIENT_SCHEDULING);
  }

  await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")));

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath("/admin/bookings");
  if (admin && formData.get("fromAdmin") === "1") {
    const clientId = String(formData.get("clientId") ?? booking.clientId);
    redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
  }
  if (admin && !session) {
    redirect("/admin/bookings?cancelled=1");
  }
  redirect(schedulingUrl({ cancelled: "1" }));
}
