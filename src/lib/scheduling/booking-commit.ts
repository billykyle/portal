import { and, eq } from "drizzle-orm";
import { deliverableClientEmails, primaryBookingContact } from "@/lib/client-contact";
import { isPendingClientEmail } from "@/lib/signup-fields";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users, type Booking } from "@/lib/db/schema";
import { listMemberUsers } from "@/lib/user-portals";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  withoutOwnBooking,
} from "@/lib/scheduling/availability";
import { bookingUserError, offeredSlotForSubmission } from "@/lib/scheduling/booking-form";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import { sendQueueHoldEmail } from "@/lib/scheduling/booking-email";
import { formatSyncIssue } from "@/lib/scheduling/booking-sync";
import { tryDeleteCalendarBooking } from "@/lib/scheduling/calendar";
import {
  canAdminOpenBooking,
  canClientOpenBooking,
  canQueueUpcomingBooking,
  confirmedTwilightDayTaken,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
  loadConfirmedTwilightDays,
} from "@/lib/scheduling/bookings";
import { parseShootAddress } from "@/lib/scheduling/address";
import { calendarConfigured, schedulingHours } from "@/lib/scheduling/config";
import { collectScheduleWarnings } from "@/lib/scheduling/admin-time";
import { bookingStartAllowed, bookingStartIsPast, clientMaySaveBookingStart } from "@/lib/scheduling/horizon";
import { isPastAdminBookingStart, pastAdminModifyWindow } from "@/lib/scheduling/modify-time";
import {
  adminQueuedScheduleWindow,
  modifyUsesExactWindow,
  queuedScheduleOverlapWarning,
} from "@/lib/scheduling/queued-schedule";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import {
  bookingServiceList,
  COMMERCIAL_VIDEO_HOURS_ERROR,
  commercialVideoHoursForServices,
  includesCommercialVideo,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import { reminderDateChanged } from "@/lib/scheduling/shoot-reminder";
import {
  includesTwilight,
  overrideTwilightDay,
  TWILIGHT_DAY_TAKEN,
  twilightAloneError,
  twilightConflictMessage,
  twilightDateKey,
} from "@/lib/scheduling/twilight";

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
  /** Same field as create_booking. Set when this save overlaps another confirmed booking. */
  overlapWarning: string | null;
  /** overlapWarning plus any other non-blocking conflict, such as a second Twilight that day. */
  warnings: string[];
  settlement: {
    action: "create" | "modify";
    skipOwnerNotify?: boolean;
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
      previous?: {
        address: string;
        services: string[];
        start: Date;
        end: Date;
        timeZone: string;
        notes: string | null;
      } | null;
      viaAgent?: boolean;
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
 * Agent `scheduleOverride` skips that grid for queued and already confirmed bookings.
 * Admin scheduling of a queued shoot does too. Calendar free/busy, Personal office
 * blocks, drive buffers, weekdays, hours, category limits, and the one-Twilight-per-day
 * rule do not reject an override. An overlap with another confirmed booking is the
 * same warning create_booking returns, and the save continues. The end is the service
 * length. Client booking and admin modify of a confirmed shoot still require an offered
 * slot (a past admin start uses the service length).
 */
export async function prepareBookingModification(input: {
  bookingId: string;
  fromAdmin: boolean;
  /** Agent tools. Ignores availability and confirms the exact start. */
  scheduleOverride?: boolean;
  session: ActorSession;
  address: string;
  services: readonly string[];
  notes: string | null;
  commercialHours?: number | null;
  startIso: string | null;
  endIso: string | null;
  /** Client MCP. Adds one line to the shoot emails. */
  viaAgent?: boolean;
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
      ? !canAdminOpenBooking(booking)
      : !input.session || !canClientOpenBooking(booking, input.session.clientId))
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
  if (!input.scheduleOverride) {
    const twilightError = twilightAloneError(services);
    if (twilightError) {
      return { ok: false, error: twilightError, stage: "book" };
    }
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
  let overlapWarning: string | null = null;

  if (modifyUsesExactWindow({ scheduleOverride: input.scheduleOverride, fromAdmin: input.fromAdmin, status: booking.status })) {
    const parsed = parseShootAddress(input.address);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, stage: "book" };
    }
    const window = adminQueuedScheduleWindow({
      startIso: input.startIso,
      services,
      commercialHours,
    });
    if (!window.ok) {
      return { ok: false, error: window.error, stage: "times", address: parsed.address };
    }
    const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: booking.id });
    overlapWarning = queuedScheduleOverlapWarning(window, portalJobs);
    if (overlapWarning) {
      console.warn(`schedule ${booking.id}: ${overlapWarning}`);
    }
    start = window.start;
    end = window.end;
    savedAddress = parsed.address;
    driveSecondsFromPrior = null;
    calendarOn = calendarConfigured();
  } else if (isPastAdminBookingStart({ fromAdmin: input.fromAdmin, start: requestedStart, now })) {
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
    const ownWindow =
      booking.startsAt && booking.endsAt ? { start: booking.startsAt, end: booking.endsAt } : null;
    const sources = ownWindow
      ? withoutOwnBooking(loaded, ownWindow, { calendarEventId: booking.calendarEventId })
      : loaded;
    const availability = await offerSlotsForAddress(input.address, sources, services, {
      retainStarts: ownWindow ? [ownWindow.start] : undefined,
      commercialHours,
      twilightBookedDays: includesTwilight(services)
        ? await loadConfirmedTwilightDays({ excludeBookingId: booking.id })
        : undefined,
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
          retainStarts: booking.startsAt ? [booking.startsAt] : undefined,
        })
      : clientMaySaveBookingStart({
          start,
          now: sources.now ?? now,
          timeZone: availability.timeZone,
          retainStarts: booking.startsAt ? [booking.startsAt] : undefined,
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
  let unmatchedPrimaryEmail = "";
  if (!user) {
    const members = await listMemberUsers(booking.clientId);
    const contact = primaryBookingContact({
      primaryEmail: client?.primaryEmail,
      logins: members,
    });
    if (contact?.login) user = contact.login;
    else if (contact?.email) unmatchedPrimaryEmail = contact.email;
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
    email: user?.email ?? (unmatchedPrimaryEmail || clientEmail),
    phone: user?.phone,
    company: client?.company,
    address: savedAddress,
    services,
    notes: input.notes,
    accessCodes: booking.accessCodes,
  });

  const dayTaken =
    includesTwilight(services) && (await confirmedTwilightDayTaken(twilightDateKey(start), booking.id));
  const twilight = overrideTwilightDay({ services, start, dayTaken });
  if (twilight.warning && !input.scheduleOverride) {
    return { ok: false, error: TWILIGHT_DAY_TAKEN, stage: "times", address: savedAddress };
  }
  let twilightWarning = input.scheduleOverride ? twilight.warning : null;
  let storedTwilightDay = twilight.twilightDay;

  const writeBooking = (day: string | null) =>
    db
      .update(bookings)
      .set({
        address: savedAddress,
        services,
        commercialVideoHours: commercialHours,
        startsAt: start,
        endsAt: end,
        notes: input.notes,
        driveSecondsFromPrior,
        status: "confirmed",
        twilightDay: day,
        ...(!booking.startsAt || reminderDateChanged(booking.startsAt, start) ? { reminderSentAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(
        input.fromAdmin
          ? and(eq(bookings.id, booking.id), eq(bookings.status, booking.status === "queued" ? "queued" : "confirmed"))
          : and(
              eq(bookings.id, booking.id),
              eq(bookings.clientId, input.session?.clientId ?? booking.clientId),
              eq(bookings.status, booking.status === "queued" ? "queued" : "confirmed"),
            ),
      )
      .returning({ id: bookings.id });

  let saved: { id: string } | undefined;
  try {
    [saved] = await writeBooking(storedTwilightDay);
  } catch (error) {
    if (twilightConflictMessage(error) && input.scheduleOverride && storedTwilightDay) {
      twilightWarning = TWILIGHT_DAY_TAKEN;
      storedTwilightDay = null;
      try {
        [saved] = await writeBooking(storedTwilightDay);
      } catch (retryError) {
        if (twilightConflictMessage(retryError)) {
          return { ok: false, error: TWILIGHT_DAY_TAKEN, stage: "times", address: savedAddress };
        }
        throw retryError;
      }
    } else if (twilightConflictMessage(error)) {
      return { ok: false, error: TWILIGHT_DAY_TAKEN, stage: "times", address: savedAddress };
    } else {
      throw error;
    }
  }
  if (!saved) {
    return { ok: false, error: "Booking could not be updated.", stage: "times", address: savedAddress };
  }

  const warnings = collectScheduleWarnings(overlapWarning, twilightWarning);
  if (twilightWarning) console.warn(`schedule ${booking.id}: ${twilightWarning}`);

  return {
    ok: true,
    bookingId: booking.id,
    overlapWarning,
    warnings,
    settlement: {
      action: booking.status === "queued" ? "create" : "modify",
      skipOwnerNotify: booking.status === "queued" && input.fromAdmin,
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
        previous:
          booking.startsAt && booking.endsAt
            ? {
                address: booking.address,
                services: bookingServiceList(booking),
                start: booking.startsAt,
                end: booking.endsAt,
                timeZone: hours.timeZone,
                notes: booking.notes,
              }
            : null,
        viaAgent: input.viaAgent || undefined,
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
  return twilightConflictMessage(error) ?? bookingUserError(error, "Booking could not be updated.");
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
  const members = await listMemberUsers(input.clientId);
  const preferred = input.ownerEmail || creatorEmail || "";
  if (preferred && !isPendingClientEmail(preferred)) {
    const [email] = deliverableClientEmails({
      preferred,
      primaryEmail: input.primaryEmail,
      loginEmails: members.map((row) => row.email),
    });
    if (email) return email;
  }
  return (
    primaryBookingContact({
      primaryEmail: input.primaryEmail,
      logins: members,
    })?.email ?? ""
  );
}

/** Status flip plus calendar delete and cancellation emails. Callers own redirects. */
export async function commitBookingCancellation(input: {
  booking: Booking;
  session: ActorSession;
  viaAgent?: boolean;
}): Promise<{ updated: boolean; issues: { calendar?: "failed"; email?: "failed" } }> {
  const { booking } = input;
  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", twilightDay: null, updatedAt: new Date() })
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
  if (!booking.startsAt || !booking.endsAt) {
    return { updated: true, issues: { email: "failed" } };
  }
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
        viaAgent: input.viaAgent || undefined,
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

/** Drop the start time, delete the calendar event, and email the client. Billy is not copied. */
export async function commitMoveToQueue(booking: Booking): Promise<
  | { ok: true; bookingId: string; issues: { calendar: boolean; email: boolean } }
  | { ok: false; error: string }
> {
  if (!canQueueUpcomingBooking(booking) || !booking.startsAt || !booking.endsAt) {
    return { ok: false, error: "Only an upcoming booking can be moved to the queue." };
  }
  const originalStart = booking.startsAt;
  const originalEnd = booking.endsAt;

  const [queued] = await db
    .update(bookings)
    .set({
      status: "queued",
      startsAt: null,
      endsAt: null,
      twilightDay: null,
      reminderSentAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });
  if (!queued) {
    return { ok: false, error: "That booking cannot be queued." };
  }

  let calendarFailed = false;
  const eventId = booking.calendarEventId?.trim();
  if (eventId) {
    try {
      const deleted = await tryDeleteCalendarBooking(eventId);
      if (!deleted) calendarFailed = true;
    } catch (error) {
      console.error("queue calendar delete failed", error);
      calendarFailed = true;
    }
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
  const members = await listMemberUsers(booking.clientId);
  const creator = members.find((member) => member.id === booking.createdByUserId);
  const contact = primaryBookingContact({
    primaryEmail: client?.primaryEmail,
    logins: members,
  });
  const named = creator?.firstName?.trim()
    ? creator
    : contact?.login?.firstName?.trim()
      ? contact.login
      : null;
  const clientEmail = await resolveBookingContactEmail({
    clientId: booking.clientId,
    createdByUserId: booking.createdByUserId,
    primaryEmail: client?.primaryEmail,
  });
  const hours = schedulingHours();
  let emailFailed = false;
  try {
    const sent = await sendQueueHoldEmail({
      bookingId: booking.id,
      clientEmail,
      primaryEmail: client?.primaryEmail ?? null,
      loginEmails: members.map((member) => member.email),
      firstName: named?.firstName ?? null,
      clientName: client?.displayName ?? null,
      address: booking.address,
      services: bookingServiceList(booking),
      start: originalStart,
      end: originalEnd,
      timeZone: hours.timeZone,
      notes: booking.notes,
      accessCodes: booking.accessCodes,
    });
    emailFailed = !sent.client.sent;
  } catch (error) {
    console.error("queue hold email failed", error);
    emailFailed = true;
  }

  await db
    .update(bookings)
    .set({
      calendarEventId: calendarFailed ? booking.calendarEventId : null,
      syncIssue: formatSyncIssue({ calendar: calendarFailed, email: emailFailed, alertFailed: false }),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, booking.id));

  return {
    ok: true,
    bookingId: booking.id,
    issues: { calendar: calendarFailed, email: emailFailed },
  };
}
