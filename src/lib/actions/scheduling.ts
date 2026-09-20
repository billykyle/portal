"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients } from "@/lib/db/schema";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  slotStillOffered,
} from "@/lib/scheduling/availability";
import { bookingUserError, readBookingFormSlot } from "@/lib/scheduling/booking-form";
import { loadConfirmedPortalJobs } from "@/lib/scheduling/bookings";
import { sendBookingConfirmation } from "@/lib/scheduling/booking-email";
import { writeCalendarBooking } from "@/lib/scheduling/calendar";
import { schedulingHours } from "@/lib/scheduling/config";
import { formatBookingServices, parseSchedulingServices } from "@/lib/scheduling/services";
import { schedulingBookHref, schedulingTimesHref } from "@/lib/scheduling/urls";

export async function createBooking(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  const address = String(formData.get("address") ?? "");
  const services = parseSchedulingServices(formData.getAll("service"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const accessCodes = String(formData.get("accessCodes") ?? "").trim() || null;
  const parsedSlot = readBookingFormSlot(formData);

  function failTimes(error: string, nextAddress = address): never {
    redirect(schedulingTimesHref({ address: nextAddress, services, notes, error }));
  }

  try {
    await ensureDb();
    if (services.length === 0) {
      redirect(schedulingBookHref({ address, notes, error: "Pick at least one service." }));
    }
    if (!parsedSlot) {
      failTimes("Pick a time.");
    }

    const { startIso, endIso } = parsedSlot;
    const portalJobs = await loadConfirmedPortalJobs();
    const sources = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in sources) {
      failTimes(sources.error);
    }
    const availability = await offerSlotsForAddress(address, sources, services);
    if (availability.error) {
      redirect(schedulingBookHref({ services, notes, error: availability.error }));
    }
    if (!slotStillOffered(availability, startIso, endIso)) {
      failTimes("That time is no longer available. Pick another.", availability.address);
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
          summary: `${formatBookingServices(services)} — ${client?.displayName ?? session.email}`,
          description: [formatBookingServices(services), notes, accessCodes ? `Access: ${accessCodes}` : ""]
            .filter(Boolean)
            .join("\n"),
        });
      } catch (error) {
        failTimes(bookingUserError(error, "Google Calendar write failed."), availability.address);
      }
    }

    await db.insert(bookings).values({
      clientId: session.clientId,
      createdByUserId: session.userId,
      address: availability.address,
      services,
      startsAt: start,
      endsAt: end,
      status: "confirmed",
      notes,
      accessCodes,
      calendarEventId,
      driveSecondsFromPrior: offered?.driveSecondsFromPrior ?? null,
    });

    try {
      await sendBookingConfirmation({
        clientEmail: session.email,
        clientName: client?.displayName ?? null,
        address: availability.address,
        services,
        start,
        end,
        timeZone: hours.timeZone,
        notes,
        accessCodes,
      });
    } catch (error) {
      console.error("Booking confirmation email failed", error);
    }
  } catch (error) {
    unstable_rethrow(error);
    failTimes(bookingUserError(error));
  }

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  redirect(schedulingBookHref({ booked: "1" }));
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
    redirect(admin ? "/admin/bookings?error=Booking%20is%20required." : schedulingBookHref({ error: "Booking is required." }));
  }
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) {
    redirect(admin ? "/admin/bookings?error=Booking%20was%20not%20found." : schedulingBookHref({ error: "Booking was not found." }));
  }
  if (!admin && booking.clientId !== session?.clientId) {
    redirect(schedulingBookHref({ error: "Booking was not found." }));
  }
  if (booking.status === "cancelled") {
    redirect(admin ? "/admin/bookings" : CLIENT_SCHEDULING);
  }

  await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")));

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  if (admin && formData.get("fromAdmin") === "1") {
    const clientId = String(formData.get("clientId") ?? booking.clientId);
    redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
  }
  if (admin && !session) {
    redirect("/admin/bookings?cancelled=1");
  }
  redirect(schedulingBookHref({ cancelled: "1" }));
}
