import { and, asc, eq } from "drizzle-orm";
import { deliverableClientEmails } from "@/lib/client-contact";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users, type Booking } from "@/lib/db/schema";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  withoutOwnBooking,
} from "@/lib/scheduling/availability";
import { bookingUserError, offeredSlotForSubmission } from "@/lib/scheduling/booking-form";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import {
  canAdminModifyBooking,
  canModifyBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "@/lib/scheduling/bookings";
import { parseShootAddress } from "@/lib/scheduling/address";
import { calendarConfigured, schedulingHours } from "@/lib/scheduling/config";
import { bookingStartAllowed, bookingStartIsPast, clientMaySaveBookingStart } from "@/lib/scheduling/horizon";
import { isPastAdminBookingStart, pastAdminModifyWindow } from "@/lib/scheduling/modify-time";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import {
  bookingServiceList,
  COMMERCIAL_VIDEO_HOURS_ERROR,
  commercialVideoHoursForServices,
  includesCommercialVideo,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import { reminderDateChanged } from "@/lib/scheduling/shoot-reminder";

type ActorSession = { clientId: string; userId: string; email: string } | null;

export type BookingModifyFailure = {
  ok: false;
  error: string;
  stage: "book" | "times";
  address?: string;
};

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
      primaryEmail?: string | null;
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
 * (agent partial updates). A stale end still saves the single offered slot for that start.
 */
export async function prepareBookingModification(input: {
  bookingId: string;
  fromAdmin: boolean;
  session: ActorSession;
  address: string;
  services: readonly string[];
  notes: string | null;
  commercialHours?: number | null;
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
  const commercialHours = commercialVideoHoursForServices(
    services,
    input.commercialHours !== undefined ? input.commercialHours : booking.commercialVideoHours,
  );
  if (includesCommercialVideo(services) && commercialHours == null) {
    return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR, stage: "book" };
  }
  if (!input.startIso) {
    return { ok: false, error: "Pick a time.", stage: "times", address: input.address };
  }

  const requestedStart = new Date(input.startIso);
  const now = new Date();
  let start: Date;
  let end: Date;
  let savedAddress: string;
  let driveSecondsFromPrior: number | null;
  let calendarOn: boolean;

  if (isPastAdminBookingStart({ fromAdmin: input.fromAdmin, start: requestedStart, now })) {
    const parsed = parseShootAddress(input.address);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, stage: "book" };
    }
    const window = pastAdminModifyWindow({
      start: requestedStart,
      services,
      commercialHours,
    });
    if (!window) {
      return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR, stage: "book" };
    }
    start = window.start;
    end = window.end;
    savedAddress = parsed.address;
    driveSecondsFromPrior = null;
    calendarOn = calendarConfigured();
  } else {
    if (!input.fromAdmin && !Number.isNaN(requestedStart.getTime()) && bookingStartIsPast(requestedStart, now)) {
      return {
        ok: false,
        error: "That time is no longer available. Pick another.",
        stage: "times",
        address: input.address,
      };
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
      commercialHours,
    });
    if (availability.error) {
      return { ok: false, error: availability.error, stage: "book" };
    }
    const offered = offeredSlotForSubmission(availability.slots, input.startIso, input.endIso);
    if (!offered) {
      return {
        ok: false,
        error: "That time is no longer available. Pick another.",
        stage: "times",
        address: availability.address,
      };
    }

    start = new Date(offered.start);
    end = new Date(offered.end);
    const startAllowed = input.fromAdmin
      ? bookingStartAllowed({
          start,
          now: sources.now ?? now,
          timeZone: availability.timeZone,
          retainStarts: [booking.startsAt],
        })
      : clientMaySaveBookingStart({
          start,
          now: sources.now ?? now,
          timeZone: availability.timeZone,
          retainStarts: [booking.startsAt],
        });
    if (!startAllowed) {
      return {
        ok: false,
        error: "That time is no longer available. Pick another.",
        stage: "times",
        address: availability.address,
      };
    }
    savedAddress = availability.address;
    driveSecondsFromPrior = offered.driveSecondsFromPrior ?? null;
    calendarOn = availability.calendarConfigured;
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
    address: savedAddress,
    services,
    notes: input.notes,
    accessCodes: booking.accessCodes,
  });

  const [saved] = await db
    .update(bookings)
    .set({
      address: savedAddress,
      services,
      commercialVideoHours: commercialHours,
      startsAt: start,
      endsAt: end,
      notes: input.notes,
      driveSecondsFromPrior,
      ...(reminderDateChanged(booking.startsAt, start) ? { reminderSentAt: null } : {}),
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
    return { ok: false, error: "Booking could not be updated.", stage: "times", address: savedAddress };
  }

  return {
    ok: true,
    bookingId: booking.id,
    settlement: {
      action: "modify",
      bookingId: booking.id,
      calendarConfigured: calendarOn,
      existingCalendarEventId: booking.calendarEventId,
      calendarWrite: {
        address: savedAddress,
        start,
        end,
        timeZone: hours.timeZone,
        summary: calendar.summary,
        description: calendar.description,
      },
      email: {
        bookingId: booking.id,
        clientEmail,
        primaryEmail: client?.primaryEmail ?? null,
        clientName: client?.displayName ?? null,
        address: savedAddress,
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
  let creatorEmail: string | null = null;
  if (input.createdByUserId) {
    const [creator] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.createdByUserId))
      .limit(1);
    creatorEmail = creator?.email ?? null;
  }
  const members = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.clientId, input.clientId))
    .orderBy(asc(users.createdAt));
  const [email] = deliverableClientEmails({
    preferred: input.ownerEmail || creatorEmail || "",
    primaryEmail: input.primaryEmail,
    loginEmails: members.map((row) => row.email),
  });
  return email ?? "";
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
        clientEmail:
          deliverableClientEmails({
            preferred: clientEmail || input.session?.email,
            primaryEmail: client?.primaryEmail,
          })[0] ?? "",
        primaryEmail: client?.primaryEmail ?? null,
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
