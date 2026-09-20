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
  const [to] = uniqueEmails([clientEmail]);
  const notify = bookingNotifyEmail();
  if (!to) return { to: [] as string[], bcc: [] as string[] };
  const bcc = uniqueEmails([notify]).filter((email) => email !== to);
  return { to: [to], bcc };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionalLines(notes: string | null | undefined, accessCodes: string | null | undefined) {
  const lines: string[] = [];
  if (notes?.trim()) {
    lines.push("", "Notes", notes.trim());
  }
  if (accessCodes?.trim()) {
    lines.push("", "Access codes", accessCodes.trim());
  }
  return lines;
}

export function buildBookingConfirmation(input: BookingConfirmationInput) {
  const when = formatBookingWhen(input.start, input.end, input.timeZone);
  const services = formatBookingServices(input.services) || "Shoot";
  const greeting = input.clientName?.trim() ? `Hi ${input.clientName.trim()},` : "Hi,";
  const extras = optionalLines(input.notes, input.accessCodes);

  const text = [
    greeting,
    "",
    "Your shoot with Billy Kyle is confirmed.",
    "",
    "When",
    `${when} (${input.timeZone})`,
    "",
    "Where",
    input.address,
    "",
    "Services",
    services,
    ...extras,
    "",
    "Reply to this email if you need to change anything.",
    "",
    "— Billy Kyle",
  ].join("\n");

  const htmlBlocks = [
    `<p>${escapeHtml(greeting)}</p>`,
    "<p>Your shoot with Billy Kyle is confirmed.</p>",
    `<p><strong>When</strong><br>${escapeHtml(when)} (${escapeHtml(input.timeZone)})</p>`,
    `<p><strong>Where</strong><br>${escapeHtml(input.address)}</p>`,
    `<p><strong>Services</strong><br>${escapeHtml(services)}</p>`,
  ];
  if (input.notes?.trim()) {
    htmlBlocks.push(`<p><strong>Notes</strong><br>${escapeHtml(input.notes.trim())}</p>`);
  }
  if (input.accessCodes?.trim()) {
    htmlBlocks.push(`<p><strong>Access codes</strong><br>${escapeHtml(input.accessCodes.trim())}</p>`);
  }
  htmlBlocks.push("<p>Reply to this email if you need to change anything.</p>");
  htmlBlocks.push("<p>— Billy Kyle</p>");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:Georgia,Times,serif;font-size:16px;line-height:1.5;">
${htmlBlocks.join("\n")}
</body>
</html>`;

  return {
    subject: `Shoot confirmed — ${when}`,
    text,
    html,
  };
}

/**
 * Confirm the booking to the logged-in client and Billy.
 * Soft-fails: never throws, never rolls back the booking.
 */
export async function sendBookingConfirmation(input: BookingConfirmationInput) {
  if (!emailConfigured()) return { sent: false as const, reason: "resend-unconfigured" };
  const { to, bcc } = bookingConfirmationRecipients(input.clientEmail);
  if (to.length === 0) return { sent: false as const, reason: "no-recipients" };

  const message = buildBookingConfirmation(input);
  return sendEmail({
    to,
    bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
