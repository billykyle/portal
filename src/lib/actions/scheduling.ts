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
import { parseShootAddress } from "@/lib/scheduling/address";
import { bookingUserError, readBookingFormSlot } from "@/lib/scheduling/booking-form";
import {
  canAdminModifyBooking,
  canModifyBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "@/lib/scheduling/bookings";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import { schedulingHours } from "@/lib/scheduling/config";
import { bookingStartAllowed } from "@/lib/scheduling/horizon";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import { bookingServiceList, parseSchedulingServices } from "@/lib/scheduling/services";
import { draftInputFromForm, type SchedulingDraftInput } from "@/lib/scheduling/draft";
import { clearSchedulingDraft, writeSchedulingDraft } from "@/lib/scheduling/draft-store";
import {
  adminBookingHref,
  adminBookingTimesHref,
  schedulingBookHref,
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
    if (!booking || !canAdminModifyBooking(booking)) {
      redirect("/admin/bookings?error=That%20booking%20cannot%20be%20modified.");
    }
  } else if (modifyId) {
    const booking = session ? await getClientBooking(session.clientId, modifyId) : null;
    if (!booking || !session || !canModifyBooking(booking, session.clientId)) {
      redirect(schedulingBookHref({ error: "That booking cannot be modified." }));
    }
  }

  if (input.services.length === 0) {
    await fail("Pick at least one service.");
    return;
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
    if (!parsedSlot) {
      await failTimes("Pick a time.");
      return;
    }

    const { startIso, endIso } = parsedSlot;
    const portalJobs = await loadConfirmedPortalJobs();
    const sources = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in sources) {
      await failTimes(sources.error);
      return;
    }
    const availability = await offerSlotsForAddress(address, sources, services);
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
      !bookingStartAllowed({
        start,
        now: sources.now ?? new Date(),
        timeZone: availability.timeZone,
      })
    ) {
      await failTimes("That time is no longer available. Pick another.", availability.address);
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
      calendarConfigured: availability.calendarConfigured,
      calendarSummary: calendar.summary,
      calendarDescription: calendar.description,
      clientEmail: session.email,
      services,
      notes,
      accessCodes,
    };
  } catch (error) {
    unstable_rethrow(error);
    await failTimes(bookingUserError(error));
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

  let updated:
    | {
        bookingId: string;
        address: string;
        start: Date;
        end: Date;
        timeZone: string;
        clientName: string | null;
        clientEmail: string;
        calendarConfigured: boolean;
        calendarEventId: string | null;
        accessCodes: string | null;
        calendarSummary: string;
        calendarDescription: string;
        services: string[];
        notes: string | null;
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
      }
    | undefined;

  try {
    await ensureDb();
    if (!bookingId) {
      await failBook("Booking is required.");
      return;
    }
    const booking = fromAdmin
      ? await getBookingById(bookingId)
      : session
        ? await getClientBooking(session.clientId, bookingId)
        : null;
    if (
      !booking ||
      (fromAdmin ? !canAdminModifyBooking(booking) : !session || !canModifyBooking(booking, session.clientId))
    ) {
      await failBook("That booking cannot be modified.");
      return;
    }
    if (services.length === 0) {
      await failBook("Pick at least one service.");
      return;
    }
    if (!parsedSlot) {
      await failTimes("Pick a time.");
      return;
    }

    const { startIso, endIso } = parsedSlot;
    const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: booking.id });
    const loaded = await loadLiveAvailabilitySources({
      portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
      portalJobs,
    });
    if ("error" in loaded) {
      await failTimes(loaded.error);
      return;
    }
    const sources = withoutOwnBooking(
      loaded,
      { start: booking.startsAt, end: booking.endsAt },
      { calendarEventId: booking.calendarEventId },
    );
    const availability = await offerSlotsForAddress(address, sources, services, {
      retainStarts: [booking.startsAt],
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
      !bookingStartAllowed({
        start,
        now: sources.now ?? new Date(),
        timeZone: availability.timeZone,
        retainStarts: [booking.startsAt],
      })
    ) {
      await failTimes("That time is no longer available. Pick another.", availability.address);
      return;
    }
    const offered = availability.slots.find((slot) => slot.start === startIso && slot.end === endIso);
    const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
    let [user] =
      session && !fromAdmin
        ? await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
        : [undefined];
    if (!user && booking.createdByUserId) {
      [user] = await db.select().from(users).where(eq(users.id, booking.createdByUserId)).limit(1);
    }
    if (!user) {
      [user] = await db.select().from(users).where(eq(users.clientId, booking.clientId)).limit(1);
    }
    const clientEmail = fromAdmin
      ? await resolveCancelledBookingEmail({
          clientId: booking.clientId,
          createdByUserId: booking.createdByUserId,
          primaryEmail: client?.primaryEmail,
        })
      : session?.email ?? "";
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
        fromAdmin
          ? and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed"))
          : and(
              eq(bookings.id, booking.id),
              eq(bookings.clientId, session?.clientId ?? booking.clientId),
              eq(bookings.status, "confirmed"),
            ),
      )
      .returning({ id: bookings.id });
    if (!saved) {
      await failTimes("Booking could not be updated.");
      return;
    }

    updated = {
      bookingId: booking.id,
      address: availability.address,
      start,
      end,
      timeZone: hours.timeZone,
      clientName: client?.displayName ?? null,
      clientEmail,
      calendarConfigured: availability.calendarConfigured,
      calendarEventId: booking.calendarEventId,
      accessCodes: booking.accessCodes,
      calendarSummary: calendar.summary,
      calendarDescription: calendar.description,
      services,
      notes,
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
    };
  } catch (error) {
    unstable_rethrow(error);
    await failTimes(bookingUserError(error, "Booking could not be updated."));
    return;
  }

  if (!updated) {
    await failTimes("Booking could not be updated.");
    return;
  }

  // Client portal modify and admin Bookings modify both send the same Shoot changes
  // email (changed-field highlight + thread to the original confirmation).
  const settled = await settleBookingIntegrations({
    action: "modify",
    bookingId: updated.bookingId,
    calendarConfigured: updated.calendarConfigured,
    existingCalendarEventId: updated.calendarEventId,
    calendarWrite: {
      address: updated.address,
      start: updated.start,
      end: updated.end,
      timeZone: updated.timeZone,
      summary: updated.calendarSummary,
      description: updated.calendarDescription,
    },
    email: {
      bookingId: updated.bookingId,
      clientEmail: updated.clientEmail,
      clientName: updated.clientName,
      address: updated.address,
      services: updated.services,
      start: updated.start,
      end: updated.end,
      timeZone: updated.timeZone,
      notes: updated.notes,
      accessCodes: updated.accessCodes,
      previous: updated.previous,
      thread: updated.thread,
    },
  });

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath("/admin/bookings");
  revalidatePath(`/admin/bookings/${updated.bookingId}`);
  await forgetSchedulingDraft(fromAdmin ? "admin" : "client");
  if (fromAdmin) {
    redirect(
      `/admin/bookings?updated=1${settled.issues.calendar ? "&calendar=failed" : ""}${
        settled.issues.email ? "&email=failed" : ""
      }`,
    );
  }
  redirect(
    schedulingConfirmedHref(updated.bookingId, {
      updated: true,
      calendar: settled.issues.calendar ? "failed" : undefined,
      email: settled.issues.email ? "failed" : undefined,
    }),
  );
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
    if (admin && formData.get("fromAdmin") === "1") {
      const clientId = String(formData.get("clientId") ?? booking.clientId);
      redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
    }
    if (admin && !session) {
      redirect("/admin/bookings");
    }
    redirect(schedulingConfirmedHref(booking.id));
  }

  const [cancelled] = await db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
    .returning({ id: bookings.id });

  let cancelledIssues: { calendar?: "failed"; email?: "failed" } = {};
  if (cancelled) {
    const ownerCancelling = Boolean(session && session.clientId === booking.clientId);
    const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId)).limit(1);
    const clientEmail = await resolveCancelledBookingEmail({
      clientId: booking.clientId,
      createdByUserId: booking.createdByUserId,
      ownerEmail: ownerCancelling ? session?.email : null,
      primaryEmail: client?.primaryEmail,
    });
    const hours = schedulingHours();
    const settled = await settleBookingIntegrations({
      action: "cancel",
      bookingId: booking.id,
      calendarConfigured: Boolean(booking.calendarEventId),
      deleteCalendarEventId: booking.calendarEventId,
      email: {
        bookingId: booking.id,
        clientEmail: clientEmail || client?.primaryEmail || session?.email || "",
        clientName: client?.displayName ?? null,
        address: booking.address,
        services: bookingServiceList(booking),
        start: booking.startsAt,
        end: booking.endsAt,
        timeZone: hours.timeZone,
        notes: booking.notes,
        accessCodes: booking.accessCodes,
      },
    });
    cancelledIssues = {
      calendar: settled.issues.calendar ? "failed" : undefined,
      email: settled.issues.email ? "failed" : undefined,
    };
  }

  revalidatePath(CLIENT_SCHEDULING);
  revalidatePath(CLIENT_SCHEDULING_TIMES);
  revalidatePath(schedulingConfirmedHref(booking.id));
  revalidatePath("/admin/bookings");
  if (admin && formData.get("fromAdmin") === "1") {
    const clientId = String(formData.get("clientId") ?? booking.clientId);
    redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
  }
  if (admin && !session) {
    redirect("/admin/bookings?cancelled=1");
  }
  redirect(schedulingConfirmedHref(booking.id, cancelledIssues));
}
