"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { getSession } from "@/lib/auth";
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
import { bookingUserError, readBookingFormSlot } from "@/lib/scheduling/booking-form";
import {
  canAdminModifyBooking,
  canModifyBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "@/lib/scheduling/bookings";
import { settleBookingIntegrations } from "@/lib/scheduling/booking-integrations";
import {
  bookingModifyThrownMessage,
  commitBookingCancellation,
  finishBookingModification,
  prepareBookingModification,
} from "@/lib/scheduling/booking-commit";
import { schedulingHours } from "@/lib/scheduling/config";
import { bookingStartAllowed } from "@/lib/scheduling/horizon";
import { calendarEventCopy } from "@/lib/scheduling/calendar-event";
import { parseSchedulingServices } from "@/lib/scheduling/services";
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

  let prepared;
  try {
    prepared = await prepareBookingModification({
      bookingId,
      fromAdmin,
      session,
      address,
      services,
      notes,
      startIso: parsedSlot?.startIso ?? null,
      endIso: parsedSlot?.endIso ?? null,
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
  if (admin && formData.get("fromAdmin") === "1") {
    const clientId = String(formData.get("clientId") ?? booking.clientId);
    redirect(`/admin/clients/${clientId}?bookingCancelled=1`);
  }
  if (admin && !session) {
    redirect("/admin/bookings?cancelled=1");
  }
  redirect(schedulingCancelConfirmHref(booking.id, cancelledIssues));
}
