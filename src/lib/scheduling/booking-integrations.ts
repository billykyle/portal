import { eq } from "drizzle-orm";
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
    patch: { calendarEventId?: string | null; syncIssue: string | null },
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

  const skipNotify = calendarFailed;
  const emails = await deps.sendEmails(input.email, { kind: input.action, skipNotify });
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
      ...input.email,
      bookingId: input.bookingId,
      action: input.action,
      failures,
    });
    alertSent = alert.sent;
    if (!alertSent) {
      logBookingSyncAlert({
        bookingId: input.bookingId,
        action: input.action,
        clientEmail: input.email.clientEmail,
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
  });

  return {
    issues: hasBookingSyncIssue(issues) ? issues : emptyBookingSyncIssue(),
    calendarEventId,
    billyNotified: notifySent || alertSent,
    alertSent,
  };
}
