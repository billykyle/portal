import { and, eq } from "drizzle-orm";
import { deliverableClientEmails } from "@/lib/client-contact";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users, type Booking } from "@/lib/db/schema";
import { listMemberUsers } from "@/lib/user-portals";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  publicCalendarError,
  withoutOwnBooking,
} from "@/lib/scheduling/availability";
import { bookingUserError, offeredSlotForSubmission } from "@/lib/scheduling/booking-form";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import { sendQueueHoldEmail } from "@/lib/scheduling/booking-email";
import { formatSyncIssue } from "@/lib/scheduling/booking-sync";
import { fetchCalendarBusy, fetchCalendarJobs, tryDeleteCalendarBooking } from "@/lib/scheduling/calendar";
import {
  canAdminOpenBooking,
  canClientOpenBooking,
  canQueueUpcomingBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "@/lib/scheduling/bookings";
import { parseShootAddress } from "@/lib/scheduling/address";
import { calendarConfigured, schedulingHours } from "@/lib/scheduling/config";
import { bookingStartAllowed, bookingStartIsPast, clientMaySaveBookingStart } from "@/lib/scheduling/horizon";
import { isPastAdminBookingStart, pastAdminModifyWindow } from "@/lib/scheduling/modify-time";
import {
  adminQueuedScheduleWindow,
  busyWithoutOwnCalendarEvent,
  isAdminQueuedSchedule,
  queuedScheduleConflictError,
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
      thread: {
        inReplyTo: string | null;
        references: string | null;
        originalSubject: string | null;
      };
    };
  };
};

/**
 * Busy time for scheduling a queued shoot: other confirmed portal bookings plus
 * Google Calendar free/busy when credentials exist. This booking's own leftover
 * event is removed. Drive time and the client slot grid are not consulted.
 */
async function loadQueuedScheduleBusy(input: {
  bookingId: string;
  window: { start: Date; end: Date };
  calendarEventId: string | null;
  timeZone: string;
}): Promise<{ busy: { start: Date; end: Date }[]; calendarConfigured: boolean } | { error: string }> {
  const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: input.bookingId });
  const portalBusy = portalJobs.map((job) => ({ start: job.start, end: job.end }));
  const calendarOn = calendarConfigured();
  if (!calendarOn) return { busy: portalBusy, calendarConfigured: false };
  try {
    const [calendarBusy, calendarJobs] = await Promise.all([
      fetchCalendarBusy(input.window, input.timeZone),
      fetchCalendarJobs(input.window, input.timeZone),
    ]);
    return {
      busy: busyWithoutOwnCalendarEvent([...portalBusy, ...calendarBusy], calendarJobs, input.calendarEventId),
      calendarConfigured: true,
    };
  } catch (error) {
    console.error("Google Calendar availability lookup failed", error);
    return { error: publicCalendarError(error) };
  }
}

/**
 * Admin and client Bookings modify share this write. Callers still own redirects,
 * drafts, and cache revalidation. `endIso` null matches the offered slot by start only
 * (agent partial updates). A stale end still saves the single offered slot for that start.
 * Admin and agent scheduling of a queued shoot skips that grid and rejects only a
 * real calendar or confirmed-booking overlap. The end is the service length.
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

  if (isAdminQueuedSchedule({ fromAdmin: input.fromAdmin, status: booking.status })) {
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
    const hours = schedulingHours();
    const busy = await loadQueuedScheduleBusy({
      bookingId: booking.id,
      window,
      calendarEventId: booking.calendarEventId,
      timeZone: hours.timeZone,
    });
    if ("error" in busy) {
      return { ok: false, error: busy.error, stage: "times", address: parsed.address };
    }
    const conflict = queuedScheduleConflictError(window, busy.busy);
    if (conflict) {
      return { ok: false, error: conflict, stage: "times", address: parsed.address };
    }
    start = window.start;
    end = window.end;
    savedAddress = parsed.address;
    driveSecondsFromPrior = null;
    calendarOn = busy.calendarConfigured;
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
  if (!user) {
    [user] = await listMemberUsers(booking.clientId);
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
      status: "confirmed",
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
  if (!saved) {
    return { ok: false, error: "Booking could not be updated.", stage: "times", address: savedAddress };
  }

  return {
    ok: true,
    bookingId: booking.id,
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
  const members = await listMemberUsers(input.clientId);
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
  const named = creator?.firstName?.trim() ? creator : members.find((member) => member.firstName?.trim());
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
