import {
  EMAIL_FONT_STACK,
  bookingEmailCtaButton,
  emailSignatureHtml,
  emailSignatureText,
  wrapBookingEmailHtml,
} from "@/lib/email-brand";
import { adminUrl, publicPortalOrigin } from "@/lib/hosts";
import {
  bookingNotifyEmail,
  emailConfigured,
  sendEmail,
  uniqueEmails,
} from "@/lib/email";
import { CLIENT_SCHEDULING } from "@/lib/routes";
import { formatBookingServices } from "./services";
import { formatBookingWhen } from "./slots";
import { schedulingConfirmedHref } from "./urls";

export type BookingConfirmationInput = {
  clientEmail: string;
  clientName?: string | null;
  bookingId?: string | null;
  address: string;
  services: readonly string[];
  start: Date;
  end: Date;
  timeZone: string;
  notes?: string | null;
  accessCodes?: string | null;
};

export function bookingConfirmationRecipients(clientEmail: string) {
  const [client] = uniqueEmails([clientEmail]);
  const [notify] = uniqueEmails([bookingNotifyEmail()]);
  return {
    client: client ?? null,
    notify: notify ?? null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bookingDetails(input: BookingConfirmationInput) {
  const when = formatBookingWhen(input.start, input.end, input.timeZone);
  const services = formatBookingServices(input.services) || "Shoot";
  const notes = input.notes?.trim() || "";
  const accessCodes = input.accessCodes?.trim() || "";
  return { when, services, notes, accessCodes };
}

export function bookingAdminUrl() {
  return adminUrl("/admin/bookings");
}

export function bookingShootManageUrl(bookingId?: string | null, options?: { updated?: boolean }) {
  const origin = publicPortalOrigin();
  const id = bookingId?.trim();
  if (id) return `${origin}${schedulingConfirmedHref(id, options)}`;
  return `${origin}${CLIENT_SCHEDULING}`;
}

/** Fresh Scheduling page — never a cancelled booking's modify/confirm URL. */
export function bookingSchedulingUrl() {
  return `${publicPortalOrigin()}${CLIENT_SCHEDULING}`;
}

type DetailRow = { label: string; value: string };

function detailRows(rows: DetailRow[]) {
  return rows.filter((row) => row.value);
}

function detailText(rows: DetailRow[]) {
  return detailRows(rows).flatMap((row, index) => (index === 0 ? [row.label, row.value] : ["", row.label, row.value]));
}

function detailHtml(rows: DetailRow[]) {
  const present = detailRows(rows);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #000000;border-collapse:collapse;">
${present
  .map(
    (row, index) => `  <tr>
    <td style="padding:16px 18px;${index < present.length - 1 ? "border-bottom:1px solid #000000;" : ""}font-family:${EMAIL_FONT_STACK};color:#000000;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#000000;">${escapeHtml(row.label)}</div>
      <div style="margin-top:6px;font-size:16px;line-height:1.45;color:#000000;">${escapeHtml(row.value).replaceAll("\n", "<br>")}</div>
    </td>
  </tr>`,
  )
  .join("\n")}
</table>`;
}

function headingHtml(title: string, subtitle?: string) {
  if (!subtitle) {
    return `<h1 style="margin:0 0 28px;font-family:${EMAIL_FONT_STACK};font-size:28px;line-height:1.2;font-weight:700;color:#000000;">${escapeHtml(title)}</h1>`;
  }
  return `<h1 style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};font-size:28px;line-height:1.2;font-weight:700;color:#000000;">${escapeHtml(title)}</h1>
<p style="margin:0 0 28px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.45;color:#000000;">${escapeHtml(subtitle)}</p>`;
}

function paragraphHtml(text: string) {
  return `<p style="margin:0 0 20px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;color:#000000;">${escapeHtml(text)}</p>`;
}

function sharedDetailRows(input: BookingConfirmationInput, extras: DetailRow[] = []) {
  const { when, services, notes, accessCodes } = bookingDetails(input);
  return [
    ...extras,
    { label: "When", value: `${when} (${input.timeZone})` },
    { label: "Where", value: input.address },
    { label: "Services", value: services },
    { label: "Notes", value: notes },
    { label: "Access codes", value: accessCodes },
  ];
}

function clientGreeting(input: BookingConfirmationInput) {
  return input.clientName?.trim() ? `Hi ${input.clientName.trim()},` : "Hi,";
}

function clientLabel(input: BookingConfirmationInput) {
  return [input.clientName?.trim(), input.clientEmail.trim()].filter(Boolean).join(" · ");
}

function clientCta(input: BookingConfirmationInput, updated: boolean) {
  return {
    label: "Modify or cancel this shoot",
    href: bookingShootManageUrl(input.bookingId, updated ? { updated: true } : undefined),
  };
}

function notifyCta() {
  return { label: "View bookings", href: bookingAdminUrl() };
}

function buildClientMessage(
  input: BookingConfirmationInput,
  copy: {
    title: string;
    intro: string;
    subjectPrefix: string;
    updated?: boolean;
    cta?: { label: string; href: string };
  },
) {
  const { when } = bookingDetails(input);
  const greeting = clientGreeting(input);
  const rows = sharedDetailRows(input);
  const cta = copy.cta ?? clientCta(input, Boolean(copy.updated));

  const text = [
    greeting,
    "",
    copy.intro,
    "",
    ...detailText(rows),
    "",
    cta.label,
    cta.href,
    "",
    emailSignatureText(),
  ].join("\n");

  const html = wrapBookingEmailHtml({
    title: copy.title,
    preheader: copy.intro,
    body: [
      headingHtml(copy.title),
      paragraphHtml(greeting),
      paragraphHtml(copy.intro),
      detailHtml(rows),
      `<div style="padding:28px 0 8px;">${bookingEmailCtaButton(cta.href, cta.label)}</div>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });

  return {
    subject: `${copy.subjectPrefix} — ${when}`,
    text,
    html,
  };
}

function buildNotifyMessage(
  input: BookingConfirmationInput,
  copy: { title: string; intro: string; subjectPrefix: string },
) {
  const { when } = bookingDetails(input);
  const rows = sharedDetailRows(input, [{ label: "Client", value: clientLabel(input) || input.clientEmail }]);
  const cta = notifyCta();

  const text = [
    copy.intro,
    "",
    ...detailText(rows),
    "",
    cta.label,
    cta.href,
    "",
    emailSignatureText(),
  ].join("\n");

  const html = wrapBookingEmailHtml({
    title: copy.title,
    preheader: copy.intro,
    body: [
      headingHtml(copy.title, when),
      paragraphHtml(copy.intro),
      detailHtml(rows),
      `<div style="padding:28px 0 8px;">${bookingEmailCtaButton(cta.href, cta.label)}</div>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });

  return {
    subject: `${copy.subjectPrefix}: ${when}`,
    text,
    html,
  };
}

/** Client-facing confirmation. Email #1. */
export function buildBookingConfirmation(input: BookingConfirmationInput) {
  return buildClientMessage(input, {
    title: "Shoot confirmed",
    intro: "Your shoot with Billy Kyle is confirmed.",
    subjectPrefix: "Shoot confirmed",
    updated: false,
  });
}

/** Billy's own booking alert. Email #2. */
export function buildBookingNotify(input: BookingConfirmationInput) {
  return buildNotifyMessage(input, {
    title: "New booking",
    intro: "New booking on the portal.",
    subjectPrefix: "New booking",
  });
}

/** Client-facing modification confirmation. Email #1. */
export function buildBookingModified(input: BookingConfirmationInput) {
  return buildClientMessage(input, {
    title: "Shoot updated",
    intro: "Your shoot with Billy Kyle has been updated.",
    subjectPrefix: "Shoot updated",
    updated: true,
  });
}

/** Billy's modification alert. Email #2. */
export function buildBookingModifiedNotify(input: BookingConfirmationInput) {
  return buildNotifyMessage(input, {
    title: "Booking updated",
    intro: "A booking was modified on the portal.",
    subjectPrefix: "Booking updated",
  });
}

/** Client-facing cancellation. Email #1. Links back to Scheduling, not this booking. */
export function buildBookingCancelled(input: BookingConfirmationInput) {
  return buildClientMessage(input, {
    title: "Shoot cancelled",
    intro: "Your appointment with Billy Kyle has been cancelled.",
    subjectPrefix: "Shoot cancelled",
    cta: {
      label: "Back to Scheduling",
      href: bookingSchedulingUrl(),
    },
  });
}

/** Billy's cancellation alert. Email #2. */
export function buildBookingCancelledNotify(input: BookingConfirmationInput) {
  return buildNotifyMessage(input, {
    title: "Booking cancelled",
    intro: "A booking was cancelled on the portal.",
    subjectPrefix: "Booking cancelled",
  });
}

export type BookingEmailSendResult = {
  sent: boolean;
  client: Awaited<ReturnType<typeof sendEmail>> | { sent: false; reason: string };
  notify: Awaited<ReturnType<typeof sendEmail>> | { sent: false; reason: string };
};

/**
 * Two separate Resend sends after a successful booking:
 * 1. Client confirmation → session email
 * 2. Billy's copy → BOOKING_NOTIFY_EMAIL (default billy@billyhere.com)
 *
 * No CC/BCC. Soft-fails: never throws, never rolls back the booking.
 * One failed send does not skip the other.
 */
export async function sendBookingConfirmation(input: BookingConfirmationInput): Promise<BookingEmailSendResult> {
  return sendBookingPair(input, buildBookingConfirmation(input), buildBookingNotify(input));
}

/** Same two-send pattern after a client modifies an upcoming booking. */
export async function sendBookingModification(input: BookingConfirmationInput): Promise<BookingEmailSendResult> {
  return sendBookingPair(input, buildBookingModified(input), buildBookingModifiedNotify(input));
}

/** Same two-send pattern after a client or Billy cancels a confirmed booking. */
export async function sendBookingCancellation(input: BookingConfirmationInput): Promise<BookingEmailSendResult> {
  return sendBookingPair(input, buildBookingCancelled(input), buildBookingCancelledNotify(input));
}

async function sendBookingPair(
  input: BookingConfirmationInput,
  clientMessage: { subject: string; text: string; html: string },
  notifyMessage: { subject: string; text: string; html: string },
): Promise<BookingEmailSendResult> {
  if (!emailConfigured()) {
    const skipped = { sent: false as const, reason: "resend-unconfigured" };
    return { sent: false, client: skipped, notify: skipped };
  }

  const recipients = bookingConfirmationRecipients(input.clientEmail);

  const [client, notify] = await Promise.all([
    recipients.client
      ? sendEmail({
          to: recipients.client,
          subject: clientMessage.subject,
          text: clientMessage.text,
          html: clientMessage.html,
        })
      : Promise.resolve({ sent: false as const, reason: "no-recipients" }),
    recipients.notify
      ? sendEmail({
          to: recipients.notify,
          subject: notifyMessage.subject,
          text: notifyMessage.text,
          html: notifyMessage.html,
        })
      : Promise.resolve({ sent: false as const, reason: "no-recipients" }),
  ]);

  return { sent: client.sent && notify.sent, client, notify };
}
