import { and, eq } from "drizzle-orm";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users, type Booking } from "@/lib/db/schema";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  withoutOwnBooking,
} from "@/lib/scheduling/availability";
import { bookingUserError } from "@/lib/scheduling/booking-form";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import {
  canAdminModifyBooking,
  canModifyBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "@/lib/scheduling/bookings";
import { schedulingHours } from "@/lib/scheduling/config";
import { bookingStartAllowed } from "@/lib/scheduling/horizon";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import { bookingServiceList, parseSchedulingServices } from "@/lib/scheduling/services";

type ActorSession = { clientId: string; userId: string; email: string } | null;

export type BookingModifyFailure = {
  ok: false;
  error: string;
  stage: "book" | "times";
  address?: string;
};

type OfferedSlot = {
  start: string;
  end: string;
  driveSecondsFromPrior: number | null;
};

function matchOfferedSlot(slots: OfferedSlot[], startIso: string, endIso: string | null) {
  if (endIso) {
    const exact = slots.find((slot) => slot.start === startIso && slot.end === endIso);
    if (exact) return exact;
  }
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) return undefined;
  const endMs = endIso ? Date.parse(endIso) : null;
  if (endIso && (endMs == null || Number.isNaN(endMs))) return undefined;
  return slots.find((slot) => {
    if (Date.parse(slot.start) !== startMs) return false;
    if (endMs == null) return true;
    return Date.parse(slot.end) === endMs;
  });
}

export type PreparedBookingModification = {
  ok: true;
  bookingId: string;
  settlement: {
    action: "modify";
    bookingId: string;
    calendarConfigured: boolean;
    existingCalendarEventId: string | null;
    calendarWrite: {
      address: string;
      start: Date;
      end: Date;
      timeZone: string;
      summary: string;
      description: string;
    };
    email: {
      bookingId: string;
      clientEmail: string;
      clientName: string | null;
      address: string;
      services: string[];
      start: Date;
      end: Date;
      timeZone: string;
      notes: string | null;
      accessCodes: string | null;
      previous: {
        address: string;
        services: string[];
        start: Date;
        end: Date;
        timeZone: string;
        notes: string | null;
      };
      thread: {
        inReplyTo: string | null;
        references: string | null;
        originalSubject: string | null;
      };
    };
  };
};

/**
 * Admin and client Bookings modify share this write. Callers still own redirects,
 * drafts, and cache revalidation. `endIso` null matches the offered slot by start only
 * (agent partial updates). The admin form always passes both ends from the chosen slot.
 */
export async function prepareBookingModification(input: {
  bookingId: string;
  fromAdmin: boolean;
  session: ActorSession;
  address: string;
  services: readonly string[];
  notes: string | null;
  startIso: string | null;
  endIso: string | null;
}): Promise<BookingModifyFailure | PreparedBookingModification> {
  await ensureDb();
  const services = parseSchedulingServices(input.services);
  if (!input.bookingId) {
    return { ok: false, error: "Booking is required.", stage: "book" };
  }
  const booking = input.fromAdmin
    ? await getBookingById(input.bookingId)
    : input.session
      ? await getClientBooking(input.session.clientId, input.bookingId)
      : null;
  if (
    !booking ||
    (input.fromAdmin
      ? !canAdminModifyBooking(booking)
      : !input.session || !canModifyBooking(booking, input.session.clientId))
  ) {
    return { ok: false, error: "That booking cannot be modified.", stage: "book" };
  }
  if (services.length === 0) {
    return { ok: false, error: "Pick at least one service.", stage: "book" };
  }
  if (!input.startIso) {
    return { ok: false, error: "Pick a time.", stage: "times", address: input.address };
  }

  const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: booking.id });
  const loaded = await loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
  if ("error" in loaded) {
    return { ok: false, error: loaded.error, stage: "times", address: input.address };
  }
  const sources = withoutOwnBooking(
    loaded,
    { start: booking.startsAt, end: booking.endsAt },
    { calendarEventId: booking.calendarEventId },
  );
  const availability = await offerSlotsForAddress(input.address, sources, services, {
    retainStarts: [booking.startsAt],
  });
  if (availability.error) {
    return { ok: false, error: availability.error, stage: "book" };
  }
  const offered = matchOfferedSlot(availability.slots, input.startIso, input.endIso);
  if (!offered) {
    return {
      ok: false,
      error: "That time is no longer available. Pick another.",
      stage: "times",
      address: availability.address,
    };
  }

  const start = new Date(offered.start);
  const end = new Date(offered.end);
  if (
    !bookingStartAllowed({
      start,
      now: sources.now ?? new Date(),
      timeZone: availability.timeZone,
      retainStarts: [booking.startsAt],
    })
  ) {
    return {
      ok: false,
      error: "That time is no longer available. Pick another.",
      stage: "times",
      address: availability.address,
    };
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
  let [user] =
    input.session && !input.fromAdmin
      ? await db.select().from(users).where(eq(users.id, input.session.userId)).limit(1)
      : [undefined];
  if (!user && booking.createdByUserId) {
    [user] = await db.select().from(users).where(eq(users.id, booking.createdByUserId)).limit(1);
  }
  if (!user) {
    [user] = await db.select().from(users).where(eq(users.clientId, booking.clientId)).limit(1);
  }
  const clientEmail = input.fromAdmin
    ? await resolveBookingContactEmail({
        clientId: booking.clientId,
        createdByUserId: booking.createdByUserId,
        primaryEmail: client?.primaryEmail,
      })
    : user?.email || input.session?.email || "";
  const hours = schedulingHours();
  const calendar = calendarEventCopy({
    firstName: user?.firstName,
    lastName: user?.lastName,
    displayName: client?.displayName,
    email: user?.email ?? clientEmail,
    phone: user?.phone,
    company: client?.company,
    address: availability.address,
    services,
    notes: input.notes,
    accessCodes: booking.accessCodes,
  });

  const [saved] = await db
    .update(bookings)
    .set({
      address: availability.address,
      services,
      startsAt: start,
      endsAt: end,
      notes: input.notes,
      driveSecondsFromPrior: offered.driveSecondsFromPrior ?? null,
      updatedAt: new Date(),
    })
    .where(
      input.fromAdmin
        ? and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed"))
        : and(
            eq(bookings.id, booking.id),
            eq(bookings.clientId, input.session?.clientId ?? booking.clientId),
            eq(bookings.status, "confirmed"),
          ),
    )
    .returning({ id: bookings.id });
  if (!saved) {
    return { ok: false, error: "Booking could not be updated.", stage: "times", address: availability.address };
  }

  return {
    ok: true,
    bookingId: booking.id,
    settlement: {
      action: "modify",
      bookingId: booking.id,
      calendarConfigured: availability.calendarConfigured,
      existingCalendarEventId: booking.calendarEventId,
      calendarWrite: {
        address: availability.address,
        start,
        end,
        timeZone: hours.timeZone,
        summary: calendar.summary,
        description: calendar.description,
      },
      email: {
        bookingId: booking.id,
        clientEmail,
        clientName: client?.displayName ?? null,
        address: availability.address,
        services,
        start,
        end,
        timeZone: hours.timeZone,
        notes: input.notes,
        accessCodes: booking.accessCodes,
        previous: {
          address: booking.address,
          services: bookingServiceList(booking),
          start: booking.startsAt,
          end: booking.endsAt,
          timeZone: hours.timeZone,
          notes: booking.notes,
        },
        thread: {
          inReplyTo: booking.clientEmailMessageId,
          references: booking.clientEmailReferences,
          originalSubject: booking.clientEmailSubject,
        },
      },
    },
  };
}

/** Shoot-changes email + calendar update. Same call the admin Bookings form makes after a save. */
export async function finishBookingModification(prepared: PreparedBookingModification) {
  const settled = await settleBookingIntegrations(prepared.settlement);
  return {
    ok: true as const,
    bookingId: prepared.bookingId,
    issues: {
      calendar: Boolean(settled.issues.calendar),
      email: Boolean(settled.issues.email),
    },
  };
}

export function bookingModifyThrownMessage(error: unknown) {
  return bookingUserError(error, "Booking could not be updated.");
}

export async function resolveBookingContactEmail(input: {
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

/** Status flip plus calendar delete and cancellation emails. Callers own redirects. */
export async function commitBookingCancellation(input: {
  booking: Booking;
  session: ActorSession;
}): Promise<{ updated: boolean; issues: { calendar?: "failed"; email?: "failed" } }> {
  const { booking } = input;
  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });

  let issues: { calendar?: "failed"; email?: "failed" } = {};
  if (!cancelled) return { updated: false, issues };

  const ownerCancelling = Boolean(input.session && input.session.clientId === booking.clientId);
  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
  let ownerEmail: string | null = null;
  if (ownerCancelling && input.session) {
    const [sessionUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.session.userId))
      .limit(1);
    ownerEmail = sessionUser?.email ?? input.session.email;
  }
  const clientEmail = await resolveBookingContactEmail({
    clientId: booking.clientId,
    createdByUserId: booking.createdByUserId,
    ownerEmail,
    primaryEmail: client?.primaryEmail,
  });
  const hours = schedulingHours();
  try {
    const settled = await settleBookingIntegrations({
      action: "cancel",
      bookingId: booking.id,
      calendarConfigured: Boolean(booking.calendarEventId),
      deleteCalendarEventId: booking.calendarEventId,
      email: {
        bookingId: booking.id,
        clientEmail: clientEmail || client?.primaryEmail || input.session?.email || "",
        clientName: client?.displayName ?? null,
        address: booking.address,
        services: bookingServiceList(booking),
        start: booking.startsAt,
        end: booking.endsAt,
        timeZone: hours.timeZone,
        notes: booking.notes,
        accessCodes: booking.accessCodes,
        thread: {
          inReplyTo: booking.clientEmailMessageId,
          references: booking.clientEmailReferences,
          originalSubject: booking.clientEmailSubject,
        },
      },
    });
    issues = {
      calendar: settled.issues.calendar ? "failed" : undefined,
      email: settled.issues.email ? "failed" : undefined,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("cancel integrations failed; booking still cancelled", error);
    issues = { email: "failed" };
  }
  return { updated: true, issues };
}
