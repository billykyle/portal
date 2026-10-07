"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { revalidateAdminHome } from "@/lib/revalidate-admin-home";
import { redirect, unstable_rethrow } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
import { prepareDeliverableBookingEmailForBooking } from "@/lib/client-contact";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users } from "@/lib/db/schema";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "@/lib/routes";
import {
  loadLiveAvailabilitySources,
  offerSlotsForAddress,
  slotStillOffered,
} from "@/lib/scheduling/availability";
import { parseShootAddress } from "@/lib/scheduling/address";
import { adminExactSlotFromForm } from "@/lib/scheduling/admin-time";
import { bookingUserError, readBookingFormSlot, readNamedBookingSlot } from "@/lib/scheduling/booking-form";
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
import { sendBookingConfirmation, sendBookingSyncIssue } from "@/lib/scheduling/booking-email";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import { formatSyncIssue, type BookingSyncFailure } from "@/lib/scheduling/booking-sync";
import { attemptReplaceCalendarBooking, portalCalendarEventId, tryDeleteCalendarBooking } from "@/lib/scheduling/calendar";
import {
  bookingModifyThrownMessage,
  commitBookingCancellation,
  commitMoveToQueue,
  finishBookingModification,
  prepareBookingModification,
} from "@/lib/scheduling/booking-commit";
import { schedulingHours } from "@/lib/scheduling/config";
import { bookingStartIsPast, clientMaySaveBookingStart } from "@/lib/scheduling/horizon";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import {
  COMMERCIAL_VIDEO_HOURS_ERROR,
  includesCommercialVideo,
  parseSchedulingServices,
} from "@/lib/scheduling/services";
import { clientCategoryServiceError, loadClientCategory } from "@/lib/scheduling/category-services";
import {
  includesTwilight,
  TWILIGHT_DAY_TAKEN,
  twilightAloneError,
  twilightConflictMessage,
  twilightDateKey,
  twilightDayValue,
} from "@/lib/scheduling/twilight";
import {
  commitTwilightPair,
  TWILIGHT_PAIR_INCOMPLETE,
  twilightBookingFlow,
  type TwilightBookingFlow,
} from "@/lib/scheduling/twilight-pair";
import { draftInputFromForm, type SchedulingDraftInput } from "@/lib/scheduling/draft";
import { clearSchedulingDraft, writeSchedulingDraft } from "@/lib/scheduling/draft-store";
import {
  adminBookingHref,
  adminBookingTimesHref,
  schedulingBookHref,
  schedulingCancelConfirmHref,
  schedulingConfirmedHref,
  schedulingTimesHref,
} from "@/lib/scheduling/urls";

async function rememberSchedulingDraft(
  scope: "client" | "admin",
  input: SchedulingDraftInput,
  owner: { clientId: string | null; userId: string | null },
) {
  try {
    await writeSchedulingDraft(scope, input, owner, { setCookie: true });
  } catch (error) {
    console.error("scheduling draft save failed", error);
  }
}

async function forgetSchedulingDraft(scope: "client" | "admin") {
  try {
    await clearSchedulingDraft(scope);
  } catch (error) {
    console.error("scheduling draft clear failed", error);
  }
}

export async function continueToTimes(formData: FormData) {
  const admin = await getAdminSession();
  const session = await getSession();
  const fromAdmin = Boolean(admin && formData.get("fromAdmin") === "1");
  if (fromAdmin && !admin) {
    redirect("/admin");
  }
  if (!fromAdmin && !session) {
    redirect("/");
  }

  const input = draftInputFromForm(formData);
  const modifyId = input.modifyBookingId;
  const scope = fromAdmin ? "admin" : "client";
  const owner = {
    clientId: fromAdmin ? null : session?.clientId ?? null,
    userId: fromAdmin ? null : session?.userId ?? null,
  };

  async function fail(error: string): Promise<never> {
    await rememberSchedulingDraft(scope, input, owner);
    if (fromAdmin) {
      redirect(modifyId ? adminBookingHref(modifyId, { error }) : "/admin/bookings");
    }
    redirect(schedulingBookHref({ modify: modifyId, error }));
  }

  await ensureDb();
  if (fromAdmin) {
    if (!modifyId) {
      redirect("/admin/bookings?error=Booking%20is%20required.");
    }
    const booking = await getBookingById(modifyId);
    if (!booking || !canAdminOpenBooking(booking)) {
      redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
    }
  } else if (modifyId) {
    const booking = session ? await getClientBooking(session.clientId, modifyId) : null;
    if (!booking || !session || !canClientOpenBooking(booking, session.clientId)) {
      redirect(schedulingBookHref({ error: "That booking cannot be modified." }));
    }
  }

  if (input.services.length === 0) {
    await fail("Pick at least one service.");
    return;
  }
  const entering = twilightBookingFlow(input.services);
  if (entering.kind !== "paired" || modifyId) {
    const twilightError = twilightAloneError(input.services);
    if (twilightError) {
      await fail(twilightError);
      return;
    }
  }
  if (includesCommercialVideo(input.services) && input.commercialHours == null) {
    await fail(COMMERCIAL_VIDEO_HOURS_ERROR);
    return;
  }
  if (!fromAdmin && session) {
    const categoryError = clientCategoryServiceError(
      input.services,
      await loadClientCategory(session.clientId),
    );
    if (categoryError) {
      await fail(categoryError);
      return;
    }
  }
  const parsed = parseShootAddress(input.address);
  if (!parsed.ok) {
    await fail(parsed.error);
    return;
  }

  await writeSchedulingDraft(scope, { ...input, address: parsed.address }, owner, { setCookie: true });
  if (fromAdmin && modifyId) {
    redirect(adminBookingTimesHref(modifyId));
  }
  redirect(schedulingTimesHref({ modify: modifyId }));
}

async function bookClientTwilightPair(input: {
  session: { clientId: string; userId: string; email: string };
  address: string;
  flow: Extract<TwilightBookingFlow, { kind: "paired" }>;
  notes: string | null;
  accessCodes: string | null;
  commercialHours: number | null;
  regularSlot: { startIso: string; endIso: string } | null;
  twilightSlot: { startIso: string; endIso: string } | null;
  failBook: (error: string) => Promise<never>;
  failTimes: (error: string, nextAddress?: string) => Promise<never>;
}): Promise<void> {
  const { session, flow } = input;
  if (!input.regularSlot || !input.twilightSlot) {
    await input.failTimes(TWILIGHT_PAIR_INCOMPLETE);
    return;
  }
  const regularSlot = input.regularSlot;
  const twilightSlot = input.twilightSlot;
  const regularStart = new Date(regularSlot.startIso);
  const regularEnd = new Date(regularSlot.endIso);
  const twilightStart = new Date(twilightSlot.startIso);
  const twilightEnd = new Date(twilightSlot.endIso);
  const now = new Date();
  if (bookingStartIsPast(regularStart, now) || bookingStartIsPast(twilightStart, now)) {
    await input.failTimes("That time is no longer available. Pick another.");
    return;
  }

  const portalJobs = await loadConfirmedPortalJobs();
  const sources = await loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
  if ("error" in sources) {
    await input.failTimes(sources.error);
    return;
  }
  const [regularAvailability, twilightAvailability] = await Promise.all([
    offerSlotsForAddress(input.address, sources, flow.regular, {
      commercialHours: input.commercialHours,
    }),
    offerSlotsForAddress(input.address, sources, flow.twilight, {
      twilightBookedDays: await loadConfirmedTwilightDays(),
    }),
  ]);
  if (regularAvailability.error) {
    await input.failBook(regularAvailability.error);
    return;
  }
  if (twilightAvailability.error) {
    await input.failBook(twilightAvailability.error);
    return;
  }
  const savedAddress = regularAvailability.address;
  if (
    !slotStillOffered(regularAvailability, regularSlot.startIso, regularSlot.endIso) ||
    !slotStillOffered(twilightAvailability, twilightSlot.startIso, twilightSlot.endIso)
  ) {
    await input.failTimes("That time is no longer available. Pick another.", savedAddress);
    return;
  }
  const clock = sources.now ?? now;
  if (
    !clientMaySaveBookingStart({ start: regularStart, now: clock, timeZone: regularAvailability.timeZone }) ||
    !clientMaySaveBookingStart({ start: twilightStart, now: clock, timeZone: twilightAvailability.timeZone })
  ) {
    await input.failTimes("That time is no longer available. Pick another.", savedAddress);
    return;
  }
  if (await confirmedTwilightDayTaken(twilightDateKey(twilightStart))) {
    await input.failTimes(TWILIGHT_DAY_TAKEN, savedAddress);
    return;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const hours = schedulingHours();
  const identity = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    displayName: client?.displayName,
    email: user?.email ?? session.email,
    phone: user?.phone,
    company: client?.company,
    address: savedAddress,
    notes: input.notes,
    accessCodes: input.accessCodes,
  };
  const regularCopy = calendarEventCopy({ ...identity, services: flow.regular });
  const twilightCopy = calendarEventCopy({ ...identity, services: flow.twilight });
  const regularOffered = regularAvailability.slots.find(
    (slot) => slot.start === regularSlot.startIso && slot.end === regularSlot.endIso,
  );
  const twilightOffered = twilightAvailability.slots.find(
    (slot) => slot.start === twilightSlot.startIso && slot.end === twilightSlot.endIso,
  );

  const result = await commitTwilightPair(
    {
      regular: {
        clientId: session.clientId,
        createdByUserId: session.userId,
        address: savedAddress,
        services: [...flow.regular],
        commercialVideoHours: input.commercialHours,
        startsAt: regularStart,
        endsAt: regularEnd,
        notes: input.notes,
        accessCodes: input.accessCodes,
        driveSecondsFromPrior: regularOffered?.driveSecondsFromPrior ?? null,
      },
      twilight: {
        clientId: session.clientId,
        createdByUserId: session.userId,
        address: savedAddress,
        services: [...flow.twilight],
        commercialVideoHours: null,
        startsAt: twilightStart,
        endsAt: twilightEnd,
        notes: input.notes,
        accessCodes: input.accessCodes,
        driveSecondsFromPrior: twilightOffered?.driveSecondsFromPrior ?? null,
      },
      calendarConfigured: regularAvailability.calendarConfigured,
      regularCalendar: {
        address: savedAddress,
        start: regularStart,
        end: regularEnd,
        timeZone: hours.timeZone,
        summary: regularCopy.summary,
        description: regularCopy.description,
      },
      twilightCalendar: {
        address: savedAddress,
        start: twilightStart,
        end: twilightEnd,
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
        await db
          .update(bookings)
          .set({ calendarEventId: eventId, updatedAt: new Date() })
          .where(eq(bookings.id, bookingId));
      },
      async sendPairEmail({ regularId, twilightId }) {
        const email = {
          bookingId: regularId,
          clientEmail: user?.email ?? session.email,
          primaryEmail: client?.primaryEmail ?? null,
          clientName: client?.displayName ?? null,
          address: savedAddress,
          services: [...flow.regular],
          start: regularStart,
          end: regularEnd,
          timeZone: hours.timeZone,
          notes: input.notes,
          accessCodes: input.accessCodes,
          companion: {
            bookingId: twilightId,
            services: [...flow.twilight],
            start: twilightStart,
            end: twilightEnd,
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

  if (!result.ok) {
    await input.failTimes(result.error, savedAddress);
    return;
  }

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  revalidateAdminHome();
  await forgetSchedulingDraft("client");
  redirect(
    schedulingConfirmedHref(result.regularId, {
      also: result.twilightId,
      email: result.emailFailed ? "failed" : undefined,
    }),
  );
}

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
  const draftInput = draftInputFromForm(formData);
  const owner = { clientId: session.clientId, userId: session.userId };

  async function failBook(error: string): Promise<never> {
    await rememberSchedulingDraft("client", draftInput, owner);
    redirect(schedulingBookHref({ error }));
  }

  async function failTimes(error: string, nextAddress = address): Promise<never> {
    await rememberSchedulingDraft("client", { ...draftInput, address: nextAddress, services }, owner);
    redirect(schedulingTimesHref({ error }));
  }

  let created:
    | {
        bookingId: string;
        address: string;
        start: Date;
        end: Date;
        timeZone: string;
        clientName: string | null;
        clientEmail: string;
        primaryEmail: string | null;
        calendarConfigured: boolean;
        calendarSummary: string;
        calendarDescription: string;
        services: string[];
        notes: string | null;
        accessCodes: string | null;
      }
    | undefined;

  try {
    await ensureDb();
    if (services.length === 0) {
      await failBook("Pick at least one service.");
      return;
    }
    const categoryError = clientCategoryServiceError(services, await loadClientCategory(session.clientId));
    if (categoryError) {
      await failBook(categoryError);
      return;
    }
    const flow = twilightBookingFlow(services);
    if (flow.kind === "paired") {
      await bookClientTwilightPair({
        session,
        address,
        flow,
        notes,
        accessCodes,
        commercialHours: draftInput.commercialHours,
        regularSlot: parsedSlot,
        twilightSlot: readNamedBookingSlot(formData, "twilightSlot"),
        failBook,
        failTimes,
      });
      return;
    }
    const twilightError = twilightAloneError(services);
    if (twilightError) {
      await failBook(twilightError);
      return;
    }
    if (!parsedSlot) {
      await failTimes("Pick a time.");
      return;
    }

    const { startIso, endIso } = parsedSlot;
    if (bookingStartIsPast(new Date(startIso), new Date())) {
      await failTimes("That time is no longer available. Pick another.");
      return;
    }
    const portalJobs = await loadConfirmedPortalJobs();
    const sources = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in sources) {
      await failTimes(sources.error);
      return;
    }
    const availability = await offerSlotsForAddress(address, sources, services, {
      commercialHours: draftInput.commercialHours,
      twilightBookedDays: includesTwilight(services) ? await loadConfirmedTwilightDays() : undefined,
    });
    if (availability.error) {
      await failBook(availability.error);
      return;
    }
    if (!slotStillOffered(availability, startIso, endIso)) {
      await failTimes("That time is no longer available. Pick another.", availability.address);
      return;
    }

    const start = new Date(startIso);
    const end = new Date(endIso);
    if (
      !clientMaySaveBookingStart({
        start,
        now: sources.now ?? new Date(),
        timeZone: availability.timeZone,
      })
    ) {
      await failTimes("That time is no longer available. Pick another.", availability.address);
      return;
    }
    if (includesTwilight(services) && (await confirmedTwilightDayTaken(twilightDateKey(start)))) {
      await failTimes(TWILIGHT_DAY_TAKEN, availability.address);
      return;
    }
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
        commercialVideoHours: draftInput.commercialHours,
        startsAt: start,
        endsAt: end,
        status: "confirmed",
        notes,
        accessCodes,
        calendarEventId: null,
        driveSecondsFromPrior: offered?.driveSecondsFromPrior ?? null,
        twilightDay: twilightDayValue(services, start),
      })
      .returning({ id: bookings.id });
    if (!booking) {
      await failTimes("Booking could not be completed.");
      return;
    }

    created = {
      bookingId: booking.id,
      address: availability.address,
      start,
      end,
      timeZone: hours.timeZone,
      clientName: client?.displayName ?? null,
      primaryEmail: client?.primaryEmail ?? null,
      calendarConfigured: availability.calendarConfigured,
      calendarSummary: calendar.summary,
      calendarDescription: calendar.description,
      clientEmail: user?.email ?? session.email,
      services,
      notes,
      accessCodes,
    };
  } catch (error) {
    unstable_rethrow(error);
    await failTimes(twilightConflictMessage(error) ?? bookingUserError(error));
    return;
  }

  if (!created) {
    await failTimes("Booking could not be completed.");
    return;
  }

  const settled = await settleBookingIntegrations({
    action: "create",
    bookingId: created.bookingId,
    calendarConfigured: created.calendarConfigured,
    calendarWrite: {
      address: created.address,
      start: created.start,
      end: created.end,
      timeZone: created.timeZone,
      summary: created.calendarSummary,
      description: created.calendarDescription,
    },
    email: {
      bookingId: created.bookingId,
      clientEmail: created.clientEmail,
      primaryEmail: created.primaryEmail,
      clientName: created.clientName,
      address: created.address,
      services: created.services,
      start: created.start,
      end: created.end,
      timeZone: created.timeZone,
      notes: created.notes,
      accessCodes: created.accessCodes,
    },
  });

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  revalidateAdminHome();
  await forgetSchedulingDraft("client");
  redirect(
    schedulingConfirmedHref(created.bookingId, {
      calendar: settled.issues.calendar ? "failed" : undefined,
      email: settled.issues.email ? "failed" : undefined,
    }),
  );
}

export async function updateBooking(formData: FormData) {
  const admin = await getAdminSession();
  const session = await getSession();
  const fromAdmin = Boolean(admin && formData.get("fromAdmin") === "1");
  if (!fromAdmin && !session) {
    redirect("/");
  }
  if (fromAdmin && !admin) {
    redirect("/admin");
  }
  const bookingId = String(formData.get("bookingId") ?? formData.get("modify") ?? "").trim();
  const address = String(formData.get("address") ?? "");
  const services = parseSchedulingServices(formData.getAll("service"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const parsedSlot = readBookingFormSlot(formData);
  const draftInput = draftInputFromForm(formData);
  const scope = fromAdmin ? "admin" : "client";
  const owner = {
    clientId: fromAdmin ? null : session?.clientId ?? null,
    userId: fromAdmin ? null : session?.userId ?? null,
  };

  async function failBook(error: string): Promise<never> {
    await rememberSchedulingDraft(scope, { ...draftInput, modifyBookingId: bookingId || null }, owner);
    if (fromAdmin && bookingId) {
      redirect(adminBookingHref(bookingId, { error }));
    }
    redirect(schedulingBookHref({ modify: bookingId || null, error }));
  }

  async function failTimes(error: string, nextAddress = address): Promise<never> {
    await rememberSchedulingDraft(
      scope,
      { ...draftInput, address: nextAddress, services, modifyBookingId: bookingId || null },
      owner,
    );
    if (fromAdmin && bookingId) {
      redirect(adminBookingTimesHref(bookingId, { error }));
    }
    redirect(schedulingTimesHref({ modify: bookingId || null, error }));
  }

  const exactSlot = fromAdmin
    ? adminExactSlotFromForm(formData, services, draftInput.commercialHours)
    : { ok: true as const, used: false as const };
  if (!exactSlot.ok) {
    await failTimes(exactSlot.error);
    return;
  }

  if (!fromAdmin && session) {
    await ensureDb();
    const categoryError = clientCategoryServiceError(services, await loadClientCategory(session.clientId));
    if (categoryError) {
      await failBook(categoryError);
      return;
    }
  }

  let prepared;
  try {
    prepared = await prepareBookingModification({
      bookingId,
      fromAdmin,
      session,
      address,
      services,
      notes,
      commercialHours: draftInput.commercialHours,
      startIso: exactSlot.used ? exactSlot.start.toISOString() : parsedSlot?.startIso ?? null,
      endIso: exactSlot.used ? exactSlot.end.toISOString() : parsedSlot?.endIso ?? null,
    });
  } catch (error) {
    unstable_rethrow(error);
    await failTimes(bookingModifyThrownMessage(error));
    return;
  }

  if (!prepared.ok) {
    if (prepared.stage === "book") {
      await failBook(prepared.error);
      return;
    }
    await failTimes(prepared.error, prepared.address ?? address);
    return;
  }

  // Client portal modify and admin Bookings modify both send the same Shoot changes
  // email (changed-field highlight + thread to the original confirmation).
  const settled = await finishBookingModification(prepared);

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  revalidateAdminHome();
  revalidatePath(`/admin/bookings/${settled.bookingId}`);
  await forgetSchedulingDraft(fromAdmin ? "admin" : "client");
  if (fromAdmin) {
    redirect(
      `/admin/bookings?updated=1${settled.issues.calendar ? "&calendar=failed" : ""}${
        settled.issues.email ? "&email=failed" : ""
      }`,
    );
  }
  redirect(
    schedulingConfirmedHref(settled.bookingId, {
      updated: true,
      calendar: settled.issues.calendar ? "failed" : undefined,
      email: settled.issues.email ? "failed" : undefined,
    }),
  );
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
    if (admin && formData.get("fromAdmin") === "1") {
      const clientId = String(formData.get("clientId") ?? booking.clientId);
      redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
    }
    if (admin && !session) {
      redirect("/admin/bookings");
    }
    redirect(schedulingCancelConfirmHref(booking.id));
  }

  const { issues: cancelledIssues } = await commitBookingCancellation({
    booking,
    session,
  });

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath(`${CLIENT_SCHEDULING_CONFIRMED}/${booking.id}`);
  revalidatePath("/admin/bookings");
  revalidateAdminHome();
  if (admin && formData.get("fromAdmin") === "1") {
    const clientId = String(formData.get("clientId") ?? booking.clientId);
    redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
  }
  if (admin && !session) {
    redirect("/admin/bookings?cancelled=1");
  }
  redirect(schedulingCancelConfirmHref(booking.id, cancelledIssues));
}

export async function queueBooking(formData: FormData) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/admin");
  }
  await ensureDb();
  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = bookingId ? await getBookingById(bookingId) : null;
  if (!booking || !canQueueUpcomingBooking(booking)) {
    redirect("/admin/bookings?error=That%20booking%20cannot%20be%20queued.");
  }
  const outcome = await commitMoveToQueue(booking);
  if (!outcome.ok) {
    redirect(`/admin/bookings?error=${encodeURIComponent(outcome.error)}`);
  }
  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  revalidateAdminHome();
  revalidatePath(`/admin/clients/${booking.clientId}`);
  redirect("/admin/bookings?queued=1");
}
