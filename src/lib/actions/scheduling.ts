"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users } from "@/lib/db/schema";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  slotStillOffered,
  withoutOwnBooking,
} from "@/lib/scheduling/availability";
import { bookingUserError, readBookingFormSlot } from "@/lib/scheduling/booking-form";
import { canModifyBooking, getClientBooking, loadConfirmedPortalJobs } from "@/lib/scheduling/bookings";
import {
  sendBookingCancellation,
  sendBookingConfirmation,
  sendBookingModification,
} from "@/lib/scheduling/booking-email";
import {
  tryDeleteCalendarBooking,
  tryReplaceCalendarBooking,
  tryWriteCalendarBooking,
} from "@/lib/scheduling/calendar";
import { schedulingHours } from "@/lib/scheduling/config";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import { bookingServiceList, parseSchedulingServices } from "@/lib/scheduling/services";
import { schedulingBookHref, schedulingConfirmedHref, schedulingTimesHref } from "@/lib/scheduling/urls";

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

  let created:
    | {
        bookingId: string;
        address: string;
        start: Date;
        end: Date;
        timeZone: string;
        clientName: string | null;
        calendarConfigured: boolean;
        calendarSummary: string;
        calendarDescription: string;
      }
    | undefined;

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
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    const hours = schedulingHours();
    const calendar = calendarEventCopy({
      firstName: user?.firstName,
      lastName: user?.lastName,
      displayName: client?.displayName,
      email: user?.email ?? session.email,
      phone: user?.phone,
      company: client?.company,
      address: availability.address,
      services,
      notes,
      accessCodes,
    });

    const [booking] = await db
      .insert(bookings)
      .values({
        clientId: session.clientId,
        createdByUserId: session.userId,
        address: availability.address,
        services,
        startsAt: start,
        endsAt: end,
        status: "confirmed",
        notes,
        accessCodes,
        calendarEventId: null,
        driveSecondsFromPrior: offered?.driveSecondsFromPrior ?? null,
      })
      .returning({ id: bookings.id });
    if (!booking) {
      failTimes("Booking could not be completed.");
    }

    try {
      await sendBookingConfirmation({
        bookingId: booking.id,
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

    created = {
      bookingId: booking.id,
      address: availability.address,
      start,
      end,
      timeZone: hours.timeZone,
      clientName: client?.displayName ?? null,
      calendarConfigured: availability.calendarConfigured,
      calendarSummary: calendar.summary,
      calendarDescription: calendar.description,
    };
  } catch (error) {
    unstable_rethrow(error);
    failTimes(bookingUserError(error));
  }

  // Calendar write is best-effort after the portal row and emails exist. A 403
  // writer-access error (or any other insert failure) must not undo Book shoot.
  if (created?.calendarConfigured) {
    try {
      const calendarEventId = await tryWriteCalendarBooking({
        address: created.address,
        start: created.start,
        end: created.end,
        timeZone: created.timeZone,
        summary: created.calendarSummary,
        description: created.calendarDescription,
      });
      if (calendarEventId) {
        await db
          .update(bookings)
          .set({ calendarEventId, updatedAt: new Date() })
          .where(eq(bookings.id, created.bookingId));
      }
    } catch (error) {
      console.error("Google Calendar write failed; booking still confirmed", error);
    }
  }

  if (!created) {
    failTimes("Booking could not be completed.");
  }

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  redirect(schedulingConfirmedHref(created.bookingId));
}

export async function updateBooking(formData: FormData) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  const bookingId = String(formData.get("bookingId") ?? formData.get("modify") ?? "").trim();
  const address = String(formData.get("address") ?? "");
  const services = parseSchedulingServices(formData.getAll("service"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const parsedSlot = readBookingFormSlot(formData);

  function failBook(error: string): never {
    redirect(schedulingBookHref({ address, services, notes, modify: bookingId || null, error }));
  }

  function failTimes(error: string, nextAddress = address): never {
    redirect(schedulingTimesHref({ address: nextAddress, services, notes, modify: bookingId || null, error }));
  }

  let updated:
    | {
        bookingId: string;
        address: string;
        start: Date;
        end: Date;
        timeZone: string;
        clientName: string | null;
        calendarConfigured: boolean;
        calendarEventId: string | null;
        accessCodes: string | null;
        calendarSummary: string;
        calendarDescription: string;
      }
    | undefined;

  try {
    await ensureDb();
    if (!bookingId) {
      failBook("Booking is required.");
    }
    const booking = await getClientBooking(session.clientId, bookingId);
    if (!booking || !canModifyBooking(booking, session.clientId)) {
      failBook("That booking cannot be modified.");
    }
    if (services.length === 0) {
      failBook("Pick at least one service.");
    }
    if (!parsedSlot) {
      failTimes("Pick a time.");
    }

    const { startIso, endIso } = parsedSlot;
    const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: booking.id });
    const loaded = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in loaded) {
      failTimes(loaded.error);
    }
    const sources = withoutOwnBooking(loaded, { start: booking.startsAt, end: booking.endsAt });
    const availability = await offerSlotsForAddress(address, sources, services, {
      retainStarts: [booking.startsAt],
    });
    if (availability.error) {
      failBook(availability.error);
    }
    if (!slotStillOffered(availability, startIso, endIso)) {
      failTimes("That time is no longer available. Pick another.", availability.address);
    }

    const start = new Date(startIso);
    const end = new Date(endIso);
    const offered = availability.slots.find((slot) => slot.start === startIso && slot.end === endIso);
    const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    const hours = schedulingHours();
    const calendar = calendarEventCopy({
      firstName: user?.firstName,
      lastName: user?.lastName,
      displayName: client?.displayName,
      email: user?.email ?? session.email,
      phone: user?.phone,
      company: client?.company,
      address: availability.address,
      services,
      notes,
      accessCodes: booking.accessCodes,
    });

    const [saved] = await db
      .update(bookings)
      .set({
        address: availability.address,
        services,
        startsAt: start,
        endsAt: end,
        notes,
        driveSecondsFromPrior: offered?.driveSecondsFromPrior ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bookings.id, booking.id),
          eq(bookings.clientId, session.clientId),
          eq(bookings.status, "confirmed"),
        ),
      )
      .returning({ id: bookings.id });
    if (!saved) {
      failTimes("Booking could not be updated.");
    }

    try {
      await sendBookingModification({
        bookingId: booking.id,
        clientEmail: session.email,
        clientName: client?.displayName ?? null,
        address: availability.address,
        services,
        start,
        end,
        timeZone: hours.timeZone,
        notes,
        accessCodes: booking.accessCodes,
      });
    } catch (error) {
      console.error("Booking modification email failed", error);
    }

    updated = {
      bookingId: booking.id,
      address: availability.address,
      start,
      end,
      timeZone: hours.timeZone,
      clientName: client?.displayName ?? null,
      calendarConfigured: availability.calendarConfigured,
      calendarEventId: booking.calendarEventId,
      accessCodes: booking.accessCodes,
      calendarSummary: calendar.summary,
      calendarDescription: calendar.description,
    };
  } catch (error) {
    unstable_rethrow(error);
    failTimes(bookingUserError(error, "Booking could not be updated."));
  }

  if (updated?.calendarConfigured) {
    try {
      const calendarEventId = await tryReplaceCalendarBooking(updated.calendarEventId, {
        address: updated.address,
        start: updated.start,
        end: updated.end,
        timeZone: updated.timeZone,
        summary: updated.calendarSummary,
        description: updated.calendarDescription,
      });
      if (calendarEventId && calendarEventId !== updated.calendarEventId) {
        await db
          .update(bookings)
          .set({ calendarEventId, updatedAt: new Date() })
          .where(eq(bookings.id, updated.bookingId));
      }
    } catch (error) {
      console.error("Google Calendar write failed; booking still updated", error);
    }
  }

  if (!updated) {
    failTimes("Booking could not be updated.");
  }

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  redirect(schedulingConfirmedHref(updated.bookingId, { updated: true }));
}

async function resolveCancelledBookingEmail(input: {
  clientId: string;
  createdByUserId: string | null;
  ownerEmail?: string | null;
  primaryEmail?: string | null;
}) {
  if (input.ownerEmail?.trim()) return input.ownerEmail.trim();
  if (input.createdByUserId) {
    const [creator] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.createdByUserId))
      .limit(1);
    if (creator?.email) return creator.email;
  }
  if (input.primaryEmail?.trim()) return input.primaryEmail.trim();
  const [member] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.clientId, input.clientId))
    .limit(1);
  return member?.email ?? "";
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

  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });

  if (cancelled) {
    try {
      const ownerCancelling = Boolean(session && session.clientId === booking.clientId);
      const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
      const clientEmail = await resolveCancelledBookingEmail({
        clientId: booking.clientId,
        createdByUserId: booking.createdByUserId,
        ownerEmail: ownerCancelling ? session?.email : null,
        primaryEmail: client?.primaryEmail,
      });
      if (clientEmail) {
        const hours = schedulingHours();
        await sendBookingCancellation({
          bookingId: booking.id,
          clientEmail,
          clientName: client?.displayName ?? null,
          address: booking.address,
          services: bookingServiceList(booking),
          start: booking.startsAt,
          end: booking.endsAt,
          timeZone: hours.timeZone,
          notes: booking.notes,
          accessCodes: booking.accessCodes,
        });
      }
    } catch (error) {
      console.error("Booking cancellation email failed", error);
    }

    // Calendar delete is best-effort after the status flip and emails. A
    // 403/404/auth failure must not undo cancel or skip cancellation mail.
    // If create never stored an event id, skip quietly.
    if (booking.calendarEventId) {
      try {
        await tryDeleteCalendarBooking(booking.calendarEventId);
      } catch (error) {
        console.error("Google Calendar delete failed; booking still cancelled", error);
      }
    }
  }

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
