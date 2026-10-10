import { eq } from "drizzle-orm";
import { prepareDeliverableBookingEmailForBooking } from "@/lib/client-contact";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users, type Booking } from "@/lib/db/schema";
import { offeredSlotForSubmission } from "@/lib/scheduling/booking-form";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import {
  commitBookingCancellation,
  finishBookingModification,
  prepareBookingModification,
  type PreparedBookingModification,
} from "@/lib/scheduling/booking-commit";
import { sendBookingConfirmation, sendBookingSyncIssue } from "@/lib/scheduling/booking-email";
import { formatSyncIssue, type BookingSyncFailure } from "@/lib/scheduling/booking-sync";
import {
  canClientOpenBooking,
  canModifyBooking,
  confirmedTwilightDayTaken,
  getClientBooking,
  loadConfirmedPortalJobs,
  loadConfirmedTwilightDays,
} from "@/lib/scheduling/bookings";
import {
  attemptReplaceCalendarBooking,
  portalCalendarEventId,
  tryDeleteCalendarBooking,
} from "@/lib/scheduling/calendar";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import { clientCategoryServiceError, loadClientCategory } from "@/lib/scheduling/category-services";
import { schedulingHours } from "@/lib/scheduling/config";
import { clientMaySaveBookingStart } from "@/lib/scheduling/horizon";
import { loadLiveAvailabilitySources, offerSlotsForAddress, type OfferedSlot } from "@/lib/scheduling/availability";
import {
  COMMERCIAL_VIDEO_HOURS_ERROR,
  bookingServiceList,
  commercialVideoHoursForServices,
  includesCommercialVideo,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import { commitTwilightPair, TWILIGHT_PAIR_INCOMPLETE, twilightBookingFlow } from "@/lib/scheduling/twilight-pair";
import {
  TWILIGHT_DAY_TAKEN,
  twilightAloneError,
  twilightConflictMessage,
  twilightDateKey,
  twilightDayValue,
} from "@/lib/scheduling/twilight";

/** Client agent saves use the portal slot grid. They never take the admin override. */
export const CLIENT_BOOKING_FLAGS = { fromAdmin: false as const, scheduleOverride: false as const };

const UNAVAILABLE = "That time is no longer available. Pick another.";

export function normalizeBookingNotes(value: string | null | undefined) {
  if (value == null) return null;
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  if (text.length > 2000) return { error: "Notes are too long." as const };
  return text;
}

export function selectOfferedClientSlot(input: {
  slots: readonly OfferedSlot[];
  startsAt: string;
  endsAt?: string | null;
  now: Date;
  timeZone: string;
}): { ok: true; slot: OfferedSlot; start: Date; end: Date } | { ok: false; error: string } {
  const offered = offeredSlotForSubmission(input.slots, input.startsAt, input.endsAt ?? null);
  if (!offered) return { ok: false, error: UNAVAILABLE };
  const start = new Date(offered.start);
  const end = new Date(offered.end);
  if (!clientMaySaveBookingStart({ start, now: input.now, timeZone: input.timeZone })) {
    return { ok: false, error: UNAVAILABLE };
  }
  return { ok: true, slot: offered, start, end };
}

export type ClientBookInput = {
  clientId: string;
  userId: string;
  email: string;
  address: string;
  services: readonly string[];
  startsAt: string;
  endsAt?: string | null;
  twilightStartsAt?: string | null;
  twilightEndsAt?: string | null;
  notes?: string | null;
  commercialHours?: number | null;
};

export type ClientBookResult =
  | {
      ok: true;
      bookingId: string;
      twilightBookingId?: string;
      address: string;
      services: string[];
      startsAt: string;
      endsAt: string;
      notes: string | null;
      calendarFailed: boolean;
      emailFailed: boolean;
    }
  | { ok: false; error: string };

async function liveSources() {
  const portalJobs = await loadConfirmedPortalJobs();
  return loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
}

function notesOrError(value: string | null | undefined): { ok: true; notes: string | null } | { ok: false; error: string } {
  const notes = normalizeBookingNotes(value);
  if (notes && typeof notes === "object") return { ok: false, error: notes.error };
  return { ok: true, notes };
}

export async function createClientAgentBooking(input: ClientBookInput): Promise<ClientBookResult> {
  await ensureDb();
  const services = parseSchedulingServices(input.services);
  if (services.length === 0) return { ok: false, error: "Pick at least one service." };
  const categoryError = clientCategoryServiceError(services, await loadClientCategory(input.clientId));
  if (categoryError) return { ok: false, error: categoryError };
  const commercialHours = commercialVideoHoursForServices(services, input.commercialHours ?? null);
  if (includesCommercialVideo(services) && commercialHours == null) {
    return { ok: false, error: COMMERCIAL_VIDEO_HOURS_ERROR };
  }
  const noted = notesOrError(input.notes);
  if (!noted.ok) return noted;
  const flow = twilightBookingFlow(services);
  if (flow.kind === "paired") {
    if (!input.twilightStartsAt) return { ok: false, error: TWILIGHT_PAIR_INCOMPLETE };
    return bookTwilightPair({ ...input, services, commercialHours, notes: noted.notes, flow });
  }
  const twilightError = twilightAloneError(services);
  if (twilightError) return { ok: false, error: twilightError };
  return bookSingle({ ...input, services, commercialHours, notes: noted.notes });
}

async function bookSingle(
  input: ClientBookInput & { services: ReturnType<typeof parseSchedulingServices>; commercialHours: number | null; notes: string | null },
): Promise<ClientBookResult> {
  const sources = await liveSources();
  if ("error" in sources) return { ok: false, error: sources.error };
  const availability = await offerSlotsForAddress(input.address, sources, input.services, {
    commercialHours: input.commercialHours,
    twilightBookedDays: input.services.some((service) => service.includes("Twilight"))
      ? await loadConfirmedTwilightDays()
      : undefined,
  });
  if (availability.error) return { ok: false, error: availability.error };
  const picked = selectOfferedClientSlot({
    slots: availability.slots,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    now: sources.now ?? new Date(),
    timeZone: availability.timeZone,
  });
  if (!picked.ok) return picked;
  if (
    input.services.some((service) => service.includes("Twilight")) &&
    (await confirmedTwilightDayTaken(twilightDateKey(picked.start)))
  ) {
    return { ok: false, error: TWILIGHT_DAY_TAKEN };
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const hours = schedulingHours();
  const calendar = calendarEventCopy({
    firstName: user?.firstName,
    lastName: user?.lastName,
    displayName: client?.displayName,
    email: user?.email ?? input.email,
    phone: user?.phone,
    company: client?.company,
    address: availability.address,
    services: input.services,
    notes: input.notes,
    accessCodes: null,
  });
  let bookingId = "";
  try {
    const [booking] = await db
      .insert(bookings)
      .values({
        clientId: input.clientId,
        createdByUserId: input.userId,
        address: availability.address,
        services: [...input.services],
        commercialVideoHours: input.commercialHours,
        startsAt: picked.start,
        endsAt: picked.end,
        status: "confirmed",
        notes: input.notes,
        accessCodes: null,
        calendarEventId: null,
        driveSecondsFromPrior: picked.slot.driveSecondsFromPrior ?? null,
        twilightDay: twilightDayValue(input.services, picked.start),
      })
      .returning({ id: bookings.id });
    if (!booking) return { ok: false, error: "Booking could not be completed." };
    bookingId = booking.id;
  } catch (error) {
    return { ok: false, error: twilightConflictMessage(error) ?? "Booking could not be completed." };
  }
  const settled = await settleBookingIntegrations({
    action: "create",
    bookingId,
    calendarConfigured: availability.calendarConfigured,
    calendarWrite: {
      address: availability.address,
      start: picked.start,
      end: picked.end,
      timeZone: hours.timeZone,
      summary: calendar.summary,
      description: calendar.description,
    },
    email: {
      bookingId,
      clientEmail: user?.email ?? input.email,
      primaryEmail: client?.primaryEmail ?? null,
      clientName: client?.displayName ?? null,
      address: availability.address,
      services: [...input.services],
      start: picked.start,
      end: picked.end,
      timeZone: hours.timeZone,
      notes: input.notes,
      accessCodes: null,
      viaAgent: true,
    },
  });
  return {
    ok: true,
    bookingId,
    address: availability.address,
    services: [...input.services],
    startsAt: picked.start.toISOString(),
    endsAt: picked.end.toISOString(),
    notes: input.notes,
    calendarFailed: Boolean(settled.issues.calendar),
    emailFailed: Boolean(settled.issues.email),
  };
}

async function bookTwilightPair(
  input: ClientBookInput & {
    services: ReturnType<typeof parseSchedulingServices>;
    commercialHours: number | null;
    notes: string | null;
    flow: Extract<ReturnType<typeof twilightBookingFlow>, { kind: "paired" }>;
  },
): Promise<ClientBookResult> {
  const sources = await liveSources();
  if ("error" in sources) return { ok: false, error: sources.error };
  const [regularAvailability, twilightAvailability] = await Promise.all([
    offerSlotsForAddress(input.address, sources, input.flow.regular, { commercialHours: input.commercialHours }),
    offerSlotsForAddress(input.address, sources, input.flow.twilight, {
      twilightBookedDays: await loadConfirmedTwilightDays(),
    }),
  ]);
  if (regularAvailability.error) return { ok: false, error: regularAvailability.error };
  if (twilightAvailability.error) return { ok: false, error: twilightAvailability.error };
  const now = sources.now ?? new Date();
  const regular = selectOfferedClientSlot({
    slots: regularAvailability.slots,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    now,
    timeZone: regularAvailability.timeZone,
  });
  if (!regular.ok) return regular;
  const twilight = selectOfferedClientSlot({
    slots: twilightAvailability.slots,
    startsAt: input.twilightStartsAt ?? "",
    endsAt: input.twilightEndsAt,
    now,
    timeZone: twilightAvailability.timeZone,
  });
  if (!twilight.ok) return twilight;
  if (await confirmedTwilightDayTaken(twilightDateKey(twilight.start))) {
    return { ok: false, error: TWILIGHT_DAY_TAKEN };
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const hours = schedulingHours();
  const identity = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    displayName: client?.displayName,
    email: user?.email ?? input.email,
    phone: user?.phone,
    company: client?.company,
    address: regularAvailability.address,
    notes: input.notes,
    accessCodes: null,
  };
  const regularCopy = calendarEventCopy({ ...identity, services: input.flow.regular });
  const twilightCopy = calendarEventCopy({ ...identity, services: input.flow.twilight });
  const result = await commitTwilightPair(
    {
      regular: {
        clientId: input.clientId,
        createdByUserId: input.userId,
        address: regularAvailability.address,
        services: [...input.flow.regular],
        commercialVideoHours: input.commercialHours,
        startsAt: regular.start,
        endsAt: regular.end,
        notes: input.notes,
        accessCodes: null,
        driveSecondsFromPrior: regular.slot.driveSecondsFromPrior ?? null,
      },
      twilight: {
        clientId: input.clientId,
        createdByUserId: input.userId,
        address: regularAvailability.address,
        services: [...input.flow.twilight],
        commercialVideoHours: null,
        startsAt: twilight.start,
        endsAt: twilight.end,
        notes: input.notes,
        accessCodes: null,
        driveSecondsFromPrior: twilight.slot.driveSecondsFromPrior ?? null,
      },
      calendarConfigured: regularAvailability.calendarConfigured,
      regularCalendar: {
        address: regularAvailability.address,
        start: regular.start,
        end: regular.end,
        timeZone: hours.timeZone,
        summary: regularCopy.summary,
        description: regularCopy.description,
      },
      twilightCalendar: {
        address: regularAvailability.address,
        start: twilight.start,
        end: twilight.end,
        timeZone: hours.timeZone,
        summary: twilightCopy.summary,
        description: twilightCopy.description,
      },
    },
    {
      async insertBooking(row) {
        const [booking] = await db.insert(bookings).values(row).returning({ id: bookings.id });
        return booking ?? null;
      },
      async deleteBooking(id) {
        await db.delete(bookings).where(eq(bookings.id, id));
      },
      twilightDayTaken: (dateKey) => confirmedTwilightDayTaken(dateKey),
      async writeCalendar(bookingId, write) {
        const eventId = portalCalendarEventId(bookingId);
        const written = await attemptReplaceCalendarBooking(null, { ...write, eventId });
        if (written.status === "written") return { ok: true, eventId: written.eventId };
        if (written.status === "skipped") return { ok: true, eventId: null };
        return { ok: false };
      },
      async deleteCalendar(eventId) {
        await tryDeleteCalendarBooking(eventId);
      },
      async saveCalendarId(bookingId, eventId) {
        await db.update(bookings).set({ calendarEventId: eventId, updatedAt: new Date() }).where(eq(bookings.id, bookingId));
      },
      async sendPairEmail({ regularId, twilightId }) {
        const email = {
          bookingId: regularId,
          clientEmail: user?.email ?? input.email,
          primaryEmail: client?.primaryEmail ?? null,
          clientName: client?.displayName ?? null,
          address: regularAvailability.address,
          services: [...input.flow.regular],
          start: regular.start,
          end: regular.end,
          timeZone: hours.timeZone,
          notes: input.notes,
          accessCodes: null,
          viaAgent: true,
          companion: {
            bookingId: twilightId,
            services: [...input.flow.twilight],
            start: twilight.start,
            end: twilight.end,
          },
        };
        const prepared = await prepareDeliverableBookingEmailForBooking(regularId, email);
        const sent = await sendBookingConfirmation(prepared.send);
        if (sent.client.sent && sent.clientMessageId) {
          await db
            .update(bookings)
            .set({
              clientEmailMessageId: sent.clientMessageId,
              clientEmailReferences: sent.clientMessageId,
              clientEmailSubject: sent.clientSubject ?? null,
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, regularId));
        }
        const emailFailed = !sent.client.sent || !sent.notify.sent;
        if (emailFailed) {
          const failures: BookingSyncFailure[] = [];
          if (!sent.client.sent) failures.push("client-email");
          if (!sent.notify.sent) failures.push("owner-email");
          const alert = await sendBookingSyncIssue({
            ...prepared.alert,
            bookingId: regularId,
            action: "create",
            failures,
          });
          const syncIssue = formatSyncIssue({ calendar: false, email: true, alertFailed: !alert.sent });
          await db.update(bookings).set({ syncIssue, updatedAt: new Date() }).where(eq(bookings.id, regularId));
          await db.update(bookings).set({ syncIssue, updatedAt: new Date() }).where(eq(bookings.id, twilightId));
        }
        return { emailFailed };
      },
    },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    bookingId: result.regularId,
    twilightBookingId: result.twilightId,
    address: regularAvailability.address,
    services: [...input.services],
    startsAt: regular.start.toISOString(),
    endsAt: regular.end.toISOString(),
    notes: input.notes,
    calendarFailed: false,
    emailFailed: result.emailFailed,
  };
}

export type ModifyDeps = {
  loadBooking: (clientId: string, bookingId: string) => Promise<Booking | null>;
  prepare: typeof prepareBookingModification;
  finish: (prepared: PreparedBookingModification) => ReturnType<typeof finishBookingModification>;
};

const defaultModifyDeps: ModifyDeps = {
  loadBooking: (clientId, bookingId) => getClientBooking(clientId, bookingId),
  prepare: prepareBookingModification,
  finish: finishBookingModification,
};

export async function modifyClientAgentBooking(
  input: {
    clientId: string;
    userId: string;
    email: string;
    bookingId: string;
    address?: string;
    services?: readonly string[];
    notes?: string | null;
    commercialHours?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
  },
  deps: ModifyDeps = defaultModifyDeps,
): Promise<
  | { ok: true; bookingId: string; calendarFailed: boolean; emailFailed: boolean }
  | { ok: false; error: string }
> {
  if (deps === defaultModifyDeps) await ensureDb();
  const current = await deps.loadBooking(input.clientId, input.bookingId);
  if (!current || !canClientOpenBooking(current, input.clientId)) {
    return { ok: false, error: "That booking cannot be modified." };
  }
  const noted = input.notes === undefined ? { ok: true as const, notes: current.notes } : notesOrError(input.notes);
  if (!noted.ok) return noted;
  const services = input.services ? parseSchedulingServices(input.services) : bookingServiceList(current);
  const prepared = await deps.prepare({
    bookingId: current.id,
    fromAdmin: CLIENT_BOOKING_FLAGS.fromAdmin,
    scheduleOverride: CLIENT_BOOKING_FLAGS.scheduleOverride,
    viaAgent: true,
    session: { clientId: input.clientId, userId: input.userId, email: input.email },
    address: input.address ?? current.address,
    services,
    notes: noted.notes,
    commercialHours: input.commercialHours === undefined ? current.commercialVideoHours : input.commercialHours,
    startIso: input.startsAt ?? current.startsAt?.toISOString() ?? null,
    endIso: input.endsAt ?? current.endsAt?.toISOString() ?? null,
  });
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const finished = await deps.finish(prepared);
  return {
    ok: true,
    bookingId: finished.bookingId,
    calendarFailed: Boolean(finished.issues.calendar),
    emailFailed: Boolean(finished.issues.email),
  };
}

export type CancelDeps = {
  loadBooking: (clientId: string, bookingId: string) => Promise<Booking | null>;
  commit: typeof commitBookingCancellation;
  now?: () => Date;
};

const defaultCancelDeps: CancelDeps = {
  loadBooking: (clientId, bookingId) => getClientBooking(clientId, bookingId),
  commit: commitBookingCancellation,
};

export async function cancelClientAgentBooking(
  input: { clientId: string; userId: string; email: string; bookingId: string },
  deps: CancelDeps = defaultCancelDeps,
): Promise<{ ok: true; bookingId: string; calendarFailed: boolean; emailFailed: boolean } | { ok: false; error: string }> {
  if (deps === defaultCancelDeps) await ensureDb();
  const current = await deps.loadBooking(input.clientId, input.bookingId);
  const now = deps.now?.() ?? new Date();
  if (!current || !canModifyBooking(current, input.clientId, now)) {
    return { ok: false, error: "That booking cannot be cancelled." };
  }
  const cancelled = await deps.commit({
    booking: current,
    session: { clientId: input.clientId, userId: input.userId, email: input.email },
    viaAgent: true,
  });
  if (!cancelled.updated) return { ok: false, error: "That booking cannot be cancelled." };
  return {
    ok: true,
    bookingId: current.id,
    calendarFailed: cancelled.issues.calendar === "failed",
    emailFailed: cancelled.issues.email === "failed",
  };
}
