import { DEFAULT_BOOKING_NOTIFY_EMAIL } from "@/lib/email";
import { formatBookingWhen } from "./slots";

export const BOOKING_SYNC_ISSUE_SUBJECT = "Portal booking sync issue";
export const BOOKING_SYNC_ALERT_LOG = "PORTAL_BOOKING_SYNC_ALERT";

export type BookingSyncAction = "create" | "modify" | "cancel";

export type BookingSyncIssue = {
  calendar: boolean;
  email: boolean;
  alertFailed: boolean;
};

export type BookingSyncFailure = "calendar" | "client-email" | "owner-email";

const EMPTY_ISSUE: BookingSyncIssue = {
  calendar: false,
  email: false,
  alertFailed: false,
};

export function emptyBookingSyncIssue(): BookingSyncIssue {
  return { ...EMPTY_ISSUE };
}

export function hasBookingSyncIssue(issue: BookingSyncIssue | null | undefined) {
  return Boolean(issue?.calendar || issue?.email || issue?.alertFailed);
}

export function formatSyncIssue(issue: BookingSyncIssue | null | undefined): string | null {
  if (!issue || !hasBookingSyncIssue(issue)) return null;
  const parts: string[] = [];
  if (issue.calendar) parts.push("calendar");
  if (issue.email) parts.push("email");
  if (issue.alertFailed) parts.push("alert");
  return parts.join("+");
}

export function parseSyncIssue(value: string | null | undefined): BookingSyncIssue {
  const tokens = new Set(
    String(value ?? "")
      .toLowerCase()
      .split(/[+,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return {
    calendar: tokens.has("calendar"),
    email: tokens.has("email"),
    alertFailed: tokens.has("alert"),
  };
}

export function mergeSyncIssue(
  stored: string | null | undefined,
  query?: { calendar?: string | null; email?: string | null },
): BookingSyncIssue {
  const fromStore = parseSyncIssue(stored);
  return {
    calendar: fromStore.calendar || query?.calendar === "failed",
    email: fromStore.email || query?.email === "failed",
    alertFailed: fromStore.alertFailed,
  };
}

export function syncFailuresFromIssue(issue: BookingSyncIssue): BookingSyncFailure[] {
  const failures: BookingSyncFailure[] = [];
  if (issue.calendar) failures.push("calendar");
  if (issue.email) failures.push("client-email");
  return failures;
}

export function bookingConfirmationCopy(input: {
  cancelled?: boolean;
  updated?: boolean;
  issue?: BookingSyncIssue | null;
  billyNotified?: boolean;
}) {
  const issue = input.issue ?? emptyBookingSyncIssue();
  const partial = issue.calendar || issue.email;
  const notified = input.billyNotified ?? !issue.alertFailed;
  const notice = bookingSyncNotice({
    calendar: issue.calendar,
    email: issue.email,
    billyNotified: notified,
  });

  if (input.cancelled) {
    return {
      title: "Shoot cancelled.",
      subtitle: partial
        ? "Your appointment with Billy Kyle has been cancelled."
        : "Your appointment with Billy Kyle has been cancelled.",
      notices: notice ? [notice] : [],
    };
  }

  if (input.updated) {
    return {
      title: "Shoot updated.",
      subtitle: partial ? "Your upcoming shoot has been changed." : "Your upcoming shoot has been changed.",
      notices: notice ? [notice] : [],
    };
  }

  if (partial) {
    return {
      title: "You're booked.",
      subtitle: "Your shoot is saved.",
      notices: notice ? [notice] : [],
    };
  }

  return {
    title: "You're all set.",
    subtitle: "Your shoot with Billy Kyle is confirmed.",
    notices: [] as string[],
  };
}

export function bookingSyncNotice(input: {
  calendar: boolean;
  email: boolean;
  billyNotified: boolean;
}): string | null {
  if (!input.calendar && !input.email) return null;
  const notified = input.billyNotified
    ? "Billy has been notified."
    : `Please contact Billy at ${DEFAULT_BOOKING_NOTIFY_EMAIL} if you need to confirm.`;
  if (input.calendar && input.email) {
    return `Calendar sync failed, and we couldn't send the confirmation email. ${notified}`;
  }
  if (input.calendar) {
    return `Calendar sync failed. ${notified}`;
  }
  return `We couldn't send the confirmation email. ${notified}`;
}

export function adminBookingNotices(booking: {
  status: string;
  calendarEventId?: string | null;
  syncIssue?: string | null;
}): string[] {
  const issue = parseSyncIssue(booking.syncIssue);
  const notices: string[] = [];
  if (issue.calendar) {
    notices.push("Calendar sync failed.");
  } else if (booking.status === "confirmed" && !booking.calendarEventId) {
    notices.push("Not on Google Calendar yet.");
  }
  if (issue.email) notices.push("Confirmation email failed.");
  if (issue.alertFailed) notices.push("Billy was not emailed about this sync issue.");
  return notices;
}

export function bookingSyncIssueLines(input: {
  action: BookingSyncAction;
  clientName?: string | null;
  clientEmail: string;
  address: string;
  services: string;
  start: Date;
  end: Date;
  timeZone: string;
  failures: readonly BookingSyncFailure[];
}) {
  const when = formatBookingWhen(input.start, input.end, input.timeZone);
  const client = [input.clientName?.trim(), input.clientEmail.trim()].filter(Boolean).join(" · ");
  const failed = describeSyncFailures(input.failures);
  const action =
    input.action === "cancel" ? "A portal cancellation" : input.action === "modify" ? "A portal modification" : "A portal booking";
  return {
    subject: BOOKING_SYNC_ISSUE_SUBJECT,
    intro: `${action} was saved, but ${failed}.`,
    rows: [
      { label: "What failed", value: failed },
      { label: "Client", value: client },
      { label: "When", value: `${when} (${input.timeZone})` },
      { label: "Where", value: input.address },
      { label: "Services", value: input.services },
    ],
  };
}

export function describeSyncFailures(failures: readonly BookingSyncFailure[]) {
  const labels = failures.map((failure) => {
    if (failure === "calendar") return "Google Calendar sync";
    if (failure === "owner-email") return "Billy's notify email";
    return "the client confirmation email";
  });
  if (labels.length === 0) return "a booking sync step failed";
  if (labels.length === 1) return `${labels[0]} failed`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} failed`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]} failed`;
}

export function logBookingSyncAlert(payload: Record<string, unknown>) {
  console.error(BOOKING_SYNC_ALERT_LOG, JSON.stringify(payload));
}
