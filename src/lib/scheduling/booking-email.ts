import {
  bookingNotifyEmail,
  emailConfigured,
  sendEmail,
  uniqueEmails,
} from "@/lib/email";
import { formatBookingServices } from "./services";
import { formatBookingWhen } from "./slots";

export type BookingConfirmationInput = {
  clientEmail: string;
  clientName?: string | null;
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

function wrapHtml(blocks: string[]) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:Georgia,Times,serif;font-size:16px;line-height:1.5;">
${blocks.join("\n")}
</body>
</html>`;
}

function detailHtml(when: string, timeZone: string, address: string, services: string, notes: string, accessCodes: string) {
  const blocks = [
    `<p><strong>When</strong><br>${escapeHtml(when)} (${escapeHtml(timeZone)})</p>`,
    `<p><strong>Where</strong><br>${escapeHtml(address)}</p>`,
    `<p><strong>Services</strong><br>${escapeHtml(services)}</p>`,
  ];
  if (notes) blocks.push(`<p><strong>Notes</strong><br>${escapeHtml(notes)}</p>`);
  if (accessCodes) blocks.push(`<p><strong>Access codes</strong><br>${escapeHtml(accessCodes)}</p>`);
  return blocks;
}

function detailText(when: string, timeZone: string, address: string, services: string, notes: string, accessCodes: string) {
  const lines = ["When", `${when} (${timeZone})`, "", "Where", address, "", "Services", services];
  if (notes) lines.push("", "Notes", notes);
  if (accessCodes) lines.push("", "Access codes", accessCodes);
  return lines;
}

/** Client-facing confirmation. Email #1. */
export function buildBookingConfirmation(input: BookingConfirmationInput) {
  const { when, services, notes, accessCodes } = bookingDetails(input);
  const greeting = input.clientName?.trim() ? `Hi ${input.clientName.trim()},` : "Hi,";

  const text = [
    greeting,
    "",
    "Your shoot with Billy Kyle is confirmed.",
    "",
    ...detailText(when, input.timeZone, input.address, services, notes, accessCodes),
    "",
    "Reply to this email if you need to change anything.",
    "",
    "— Billy Kyle",
  ].join("\n");

  const html = wrapHtml([
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>Your shoot with Billy Kyle is confirmed.</p>",
    ...detailHtml(when, input.timeZone, input.address, services, notes, accessCodes),
    "<p>Reply to this email if you need to change anything.</p>",
    "<p>— Billy Kyle</p>",
  ]);

  return {
    subject: `Shoot confirmed — ${when}`,
    text,
    html,
  };
}

/** Billy's own booking alert. Email #2. */
export function buildBookingNotify(input: BookingConfirmationInput) {
  const { when, services, notes, accessCodes } = bookingDetails(input);
  const clientLabel = [input.clientName?.trim(), input.clientEmail.trim()].filter(Boolean).join(" · ");

  const text = [
    "New booking on the portal.",
    "",
    "Client",
    clientLabel || input.clientEmail,
    "",
    ...detailText(when, input.timeZone, input.address, services, notes, accessCodes),
  ].join("\n");

  const html = wrapHtml([
    "<p>New booking on the portal.</p>",
    `<p><strong>Client</strong><br>${escapeHtml(clientLabel || input.clientEmail)}</p>`,
    ...detailHtml(when, input.timeZone, input.address, services, notes, accessCodes),
  ]);

  return {
    subject: `New booking: ${when}`,
    text,
    html,
  };
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
  if (!emailConfigured()) {
    const skipped = { sent: false as const, reason: "resend-unconfigured" };
    return { sent: false, client: skipped, notify: skipped };
  }

  const recipients = bookingConfirmationRecipients(input.clientEmail);
  const clientMessage = buildBookingConfirmation(input);
  const notifyMessage = buildBookingNotify(input);

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
