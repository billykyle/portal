import { eq } from "drizzle-orm";
import { prepareDeliverableBookingEmailForBooking } from "@/lib/client-contact";
import { db } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import {
  sendBookingCancellation,
  sendBookingConfirmation,
  sendBookingModification,
  sendBookingSyncIssue,
  type BookingConfirmationInput,
  type BookingEmailSendResult,
} from "./booking-email";
import {
  emptyBookingSyncIssue,
  formatSyncIssue,
  hasBookingSyncIssue,
  logBookingSyncAlert,
  type BookingSyncAction,
  type BookingSyncFailure,
  type BookingSyncIssue,
} from "./booking-sync";
import {
  attemptReplaceCalendarBooking,
  portalCalendarEventId,
  tryDeleteCalendarBooking,
  type CalendarMutationResult,
  type CalendarWriteInput,
} from "./calendar";

export type BookingIntegrationDeps = {
  writeCalendar: (input: CalendarWriteInput & { existingId?: string | null }) => Promise<CalendarMutationResult>;
  deleteCalendar: (eventId: string) => Promise<boolean>;
  sendEmails: (
    input: BookingConfirmationInput,
    options: { kind: BookingSyncAction; skipNotify?: boolean },
  ) => Promise<BookingEmailSendResult>;
  sendSyncIssue: (input: BookingConfirmationInput & {
    action: BookingSyncAction;
    failures: BookingSyncFailure[];
  }) => Promise<{ sent: boolean }>;
  saveBookingSync: (
    bookingId: string,
    patch: {
      calendarEventId?: string | null;
      syncIssue: string | null;
      clientEmailMessageId?: string | null;
      clientEmailReferences?: string | null;
      clientEmailSubject?: string | null;
    },
  ) => Promise<void>;
};

export function defaultBookingIntegrationDeps(): BookingIntegrationDeps {
  return {
    async writeCalendar(input) {
      return attemptReplaceCalendarBooking(input.existingId ?? input.eventId, input);
    },
    async deleteCalendar(eventId) {
      return tryDeleteCalendarBooking(eventId);
    },
    async sendEmails(input, options) {
      if (options.kind === "modify") return sendBookingModification(input, { skipNotify: options.skipNotify });
      if (options.kind === "cancel") return sendBookingCancellation(input, { skipNotify: options.skipNotify });
      return sendBookingConfirmation(input, { skipNotify: options.skipNotify });
    },
    async sendSyncIssue(input) {
      return sendBookingSyncIssue(input);
    },
    async saveBookingSync(bookingId, patch) {
      await db
        .update(bookings)
        .set({
          ...(patch.calendarEventId !== undefined ? { calendarEventId: patch.calendarEventId } : {}),
          ...(patch.clientEmailMessageId !== undefined
            ? { clientEmailMessageId: patch.clientEmailMessageId }
            : {}),
          ...(patch.clientEmailReferences !== undefined
            ? { clientEmailReferences: patch.clientEmailReferences }
            : {}),
          ...(patch.clientEmailSubject !== undefined ? { clientEmailSubject: patch.clientEmailSubject } : {}),
          syncIssue: patch.syncIssue,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId));
    },
  };
}

export async function settleBookingIntegrations(
  input: {
    action: BookingSyncAction;
    bookingId: string;
    calendarConfigured: boolean;
    existingCalendarEventId?: string | null;
    calendarWrite?: CalendarWriteInput;
    deleteCalendarEventId?: string | null;
    email: BookingConfirmationInput;
    /** Skip Billy's New shoot / updated notify even when the calendar write succeeded. */
    skipOwnerNotify?: boolean;
  },
  deps: BookingIntegrationDeps = defaultBookingIntegrationDeps(),
): Promise<{
  issues: BookingSyncIssue;
  calendarEventId: string | null;
  billyNotified: boolean;
  alertSent: boolean;
}> {
  let calendarEventId = input.existingCalendarEventId ?? null;
  let calendarFailed = false;

  if (input.action === "cancel") {
    const deleteId = input.deleteCalendarEventId?.trim();
    if (deleteId) {
      const deleted = await deps.deleteCalendar(deleteId);
      if (!deleted) calendarFailed = true;
    }
  } else if (input.calendarConfigured && input.calendarWrite) {
    const eventId = calendarEventId || portalCalendarEventId(input.bookingId);
    const written = await deps.writeCalendar({
      ...input.calendarWrite,
      eventId,
      existingId: calendarEventId,
    });
    if (written.status === "written") {
      calendarEventId = written.eventId;
    } else {
      calendarFailed = true;
    }
  }

  // Create/modify: skip Pepper "already on calendar" notify when Calendar write failed.
  // Admin book-a-shoot also skips that New shoot mail when the calendar write succeeded.
  // Cancel: always attempt both branded cancel emails; sync-issue alert is additive.
  const prepared = await prepareDeliverableBookingEmailForBooking(input.bookingId, input.email);
  const skipNotify =
    (Boolean(input.skipOwnerNotify) && input.action !== "cancel") ||
    (calendarFailed && input.action !== "cancel");
  const emails = await deps.sendEmails(prepared.send, { kind: input.action, skipNotify });
  const clientEmailFailed = !emails.client.sent;
  const ownerEmailFailed = skipNotify ? false : !emails.notify.sent;
  const emailFailed = clientEmailFailed || ownerEmailFailed;
  const notifySent = emails.notify.sent;
  const needsAlert = calendarFailed || emailFailed;

  const failures: BookingSyncFailure[] = [];
  if (calendarFailed) failures.push("calendar");
  if (clientEmailFailed) failures.push("client-email");
  if (ownerEmailFailed) failures.push("owner-email");

  let alertSent = false;
  if (needsAlert) {
    const alert = await deps.sendSyncIssue({
      ...prepared.alert,
      bookingId: input.bookingId,
      action: input.action,
      failures,
    });
    alertSent = alert.sent;
    if (!alertSent) {
      logBookingSyncAlert({
        bookingId: input.bookingId,
        action: input.action,
        clientEmail: prepared.alert.clientEmail,
        clientName: input.email.clientName ?? null,
        address: input.email.address,
        start: input.email.start.toISOString(),
        end: input.email.end.toISOString(),
        timeZone: input.email.timeZone,
        failures,
        calendarEventId,
      });
    }
  }

  const issues: BookingSyncIssue = {
    calendar: calendarFailed,
    email: emailFailed,
    alertFailed: needsAlert && !alertSent,
  };

  await deps.saveBookingSync(input.bookingId, {
    ...(input.action === "cancel" ? {} : { calendarEventId }),
    syncIssue: formatSyncIssue(issues),
    ...(input.action === "create" && emails.client.sent && emails.clientMessageId
      ? {
          clientEmailMessageId: emails.clientMessageId,
          clientEmailReferences: emails.clientMessageId,
          clientEmailSubject: emails.clientSubject ?? null,
        }
      : {}),
  });

  return {
    issues: hasBookingSyncIssue(issues) ? issues : emptyBookingSyncIssue(),
    calendarEventId,
    billyNotified: notifySent || alertSent,
    alertSent,
  };
}
