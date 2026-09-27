import { deliverableClientEmails } from "@/lib/client-contact";
import { bookingNotifyEmail, normalizeEmail, uniqueEmails } from "@/lib/email";
import { isPendingClientEmail } from "@/lib/signup-fields";
import {
  EMAIL_FONT_STACK,
  emailActionButtons,
  emailSignatureHtml,
  emailSignatureText,
  wrapBookingEmailHtml,
} from "@/lib/email-brand";
import { publicPortalOrigin } from "@/lib/hosts";
import { calendarDateKey, utcToZonedParts, zonedDateTimeToUtc } from "@/lib/scheduling/zoned-time";
import { emailsInNotes } from "@/lib/scheduling/notes-emails";
import { formatBookingServices } from "@/lib/scheduling/services";
import { formatBookingWhen } from "@/lib/scheduling/slots";
import { schedulingBookHref, schedulingConfirmedHref } from "@/lib/scheduling/urls";
import {
  emailThreadingHeaders,
  replySubject,
  type BookingEmailThread,
} from "@/lib/scheduling/booking-email";

/** Reminder clock. Independent of the scheduling display zone. */
export const REMINDER_TIME_ZONE = "America/New_York";
export const REMINDER_HOUR = 6;
/** Bookings created inside this window before the shoot never get a reminder. */
export const REMINDER_MIN_LEAD_MS = 12 * 60 * 60 * 1000;

export const REMINDER_ACCESS_LINE = "Have access and lockbox info ready.";

export type ReminderDecision = "send" | "wait" | "skip";

export type ReminderBooking = {
  status: string;
  startsAt: Date;
  createdAt: Date;
  reminderSentAt: Date | null;
};

/** 6:00am on the shoot's calendar day in America/New_York, including across DST. */
export function reminderInstant(startsAt: Date, timeZone = REMINDER_TIME_ZONE) {
  const shootDay = utcToZonedParts(startsAt, timeZone);
  return zonedDateTimeToUtc(timeZone, {
    year: shootDay.year,
    month: shootDay.month,
    day: shootDay.day,
    hour: REMINDER_HOUR,
    minute: 0,
    second: 0,
  });
}

export function reminderShootDateKey(startsAt: Date, timeZone = REMINDER_TIME_ZONE) {
  return calendarDateKey(utcToZonedParts(startsAt, timeZone));
}

/** A new shoot date gets another reminder. A same-day time change does not. */
export function reminderDateChanged(previous: Date, next: Date, timeZone = REMINDER_TIME_ZONE) {
  return reminderShootDateKey(previous, timeZone) !== reminderShootDateKey(next, timeZone);
}

/**
 * Hourly cron sends once `now` is at or after 6:00am ET on the shoot day.
 * A missed hour still sends later that morning until the shoot starts.
 * A booking created less than 12 hours before the start is skipped, as are
 * cancelled bookings and any reminder already sent.
 */
export function reminderDecision(booking: ReminderBooking, now: Date): ReminderDecision {
  if (booking.status !== "confirmed") return "skip";
  if (booking.reminderSentAt) return "skip";
  if (booking.startsAt.getTime() <= now.getTime()) return "skip";
  if (booking.startsAt.getTime() - booking.createdAt.getTime() < REMINDER_MIN_LEAD_MS) return "skip";
  const dueAt = reminderInstant(booking.startsAt);
  if (now.getTime() < dueAt.getTime()) return "wait";
  return "send";
}

export function reminderRecipients(
  input: {
    clientEmail?: string | null;
    primaryEmail?: string | null;
    loginEmails?: readonly (string | null | undefined)[] | null;
    notes?: string | null;
  },
  notifyEmail: string | null = bookingNotifyEmail(),
) {
  const client = deliverableClientEmails({
    preferred: input.clientEmail,
    primaryEmail: input.primaryEmail,
    loginEmails: input.loginEmails,
  });
  const copies = emailsInNotes(input.notes, [input.clientEmail, input.primaryEmail, ...client]);
  const blocked = normalizeEmail(notifyEmail);
  return uniqueEmails([...client, ...copies]).filter(
    (email) => !isPendingClientEmail(email) && email !== blocked,
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function reminderManageLinks(bookingId: string) {
  const origin = publicPortalOrigin();
  return {
    modify: `${origin}${schedulingBookHref({ modify: bookingId })}`,
    cancel: `${origin}${schedulingConfirmedHref(bookingId)}`,
  };
}

export function buildShootReminder(input: {
  bookingId: string;
  address: string;
  services: readonly string[];
  start: Date;
  end: Date;
  timeZone: string;
  notes?: string | null;
  thread?: BookingEmailThread | null;
}) {
  const when = formatBookingWhen(input.start, input.end, input.timeZone);
  const services = formatBookingServices(input.services) || "Shoot";
  const notes = input.notes?.trim() || "";
  const links = reminderManageLinks(input.bookingId);
  const subject = replySubject(input.thread?.originalSubject, `Shoot reminder — ${when}`);
  const rows = [
    { label: "When", value: when },
    { label: "Services", value: services },
    ...(notes ? [{ label: "Notes", value: notes }] : []),
  ];

  const text = [
    input.address,
    "",
    REMINDER_ACCESS_LINE,
    "",
    ...rows.flatMap((row) => [row.label, row.value, ""]),
    `Modify: ${links.modify}`,
    `Cancel: ${links.cancel}`,
    "",
    emailSignatureText(),
  ].join("\n");

  const detailRows = rows
    .map(
      (row, index) => `  <tr>
    <td style="padding:16px 18px;${index < rows.length - 1 ? "border-bottom:1px solid #000000;" : ""}font-family:${EMAIL_FONT_STACK};color:#000000;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;">${escapeHtml(row.label)}</div>
      <div style="margin-top:6px;font-size:16px;line-height:1.45;">${escapeHtml(row.value).replaceAll("\n", "<br>")}</div>
    </td>
  </tr>`,
    )
    .join("\n");

  const html = wrapBookingEmailHtml({
    title: "Shoot reminder",
    preheader: input.address,
    body: [
      `<h1 style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};font-size:28px;line-height:1.2;font-weight:700;color:#000000;">Shoot reminder</h1>`,
      `<p style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};font-size:22px;line-height:1.3;font-weight:700;color:#000000;">${escapeHtml(input.address)}</p>`,
      `<p style="margin:0 0 20px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;color:#000000;">${escapeHtml(REMINDER_ACCESS_LINE)}</p>`,
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #000000;border-collapse:collapse;">
${detailRows}
</table>`,
      `<div style="padding-top:24px;">${emailActionButtons([
        { href: links.modify, label: "Modify", variant: "primary" },
        { href: links.cancel, label: "Cancel", variant: "secondary" },
      ])}</div>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });

  return {
    subject,
    text,
    html,
    headers: emailThreadingHeaders(input.thread),
  };
}
