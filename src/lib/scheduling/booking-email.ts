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
  type EmailAttachment,
  type SendEmailResult,
} from "@/lib/email";
import { CLIENT_SCHEDULING } from "@/lib/routes";
import { clientCalendarLinks } from "./booking-ics";
import {
  BOOKING_SYNC_ISSUE_SUBJECT,
  bookingSyncIssueLines,
  type BookingSyncAction,
  type BookingSyncFailure,
} from "./booking-sync";
import { formatBookingServices } from "./services";
import { formatBookingWhen } from "./slots";
import { schedulingConfirmedHref } from "./urls";

export type BookingSnapshot = {
  address: string;
  services: readonly string[];
  start: Date;
  end: Date;
  timeZone: string;
  notes?: string | null;
};

export type BookingEmailThread = {
  inReplyTo?: string | null;
  references?: string | null;
  originalSubject?: string | null;
};

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
  previous?: BookingSnapshot | null;
  thread?: BookingEmailThread | null;
};

export function normalizeEmailMessageId(raw: string | null | undefined) {
  const id = String(raw ?? "").trim();
  if (!id) return "";
  return id.startsWith("<") && id.endsWith(">") ? id : `<${id.replace(/^<|>$/g, "")}>`;
}

export function bookingThreadMessageId(bookingId: string) {
  return `<booking-${bookingId}@portal.billy-kyle.com>`;
}

export function emailThreadingHeaders(thread?: BookingEmailThread | null) {
  const inReplyTo = normalizeEmailMessageId(thread?.inReplyTo);
  if (!inReplyTo) return undefined;
  const references = String(thread?.references ?? "")
    .split(/\s+/)
    .map((part) => normalizeEmailMessageId(part))
    .filter(Boolean);
  return {
    "In-Reply-To": inReplyTo,
    References: (references.length > 0 ? references : [inReplyTo]).join(" "),
  };
}

export function replySubject(originalSubject: string | null | undefined, fallback: string) {
  const original = originalSubject?.trim();
  if (!original) return fallback;
  return /^re:\s*/i.test(original) ? original : `Re: ${original}`;
}

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

type DetailRow = { label: string; value: string; changed?: boolean };

export type BookingFieldChange = {
  key: "when" | "where" | "services" | "notes";
  label: string;
  previous: string;
  current: string;
};

export function bookingFieldChanges(
  current: BookingConfirmationInput,
  previous?: BookingSnapshot | null,
): BookingFieldChange[] {
  if (!previous) return [];
  const next = bookingDetails(current);
  const prior = bookingDetails({ ...current, ...previous, bookingId: current.bookingId });
  const rows: BookingFieldChange[] = [
    {
      key: "when",
      label: "When",
      previous: `${prior.when} (${previous.timeZone})`,
      current: `${next.when} (${current.timeZone})`,
    },
    {
      key: "where",
      label: "Where",
      previous: previous.address,
      current: current.address,
    },
    {
      key: "services",
      label: "Services",
      previous: prior.services,
      current: next.services,
    },
    {
      key: "notes",
      label: "Notes",
      previous: previous.notes?.trim() || "",
      current: current.notes?.trim() || "",
    },
  ];
  return rows.filter((row) => row.previous !== row.current);
}

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
  .map((row, index) => {
    const highlight = row.changed ? "background:#fff6cc;" : "";
    const valueWeight = row.changed ? "font-weight:700;" : "";
    const label = row.changed ? `${row.label} · Changed` : row.label;
    return `  <tr>
    <td style="padding:16px 18px;${highlight}${index < present.length - 1 ? "border-bottom:1px solid #000000;" : ""}font-family:${EMAIL_FONT_STACK};color:#000000;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#000000;">${escapeHtml(label)}</div>
      <div style="margin-top:6px;font-size:16px;line-height:1.45;color:#000000;${valueWeight}">${escapeHtml(row.value).replaceAll("\n", "<br>")}</div>
    </td>
  </tr>`;
  })
  .join("\n")}
</table>`;
}

function changeSummaryText(changes: BookingFieldChange[]) {
  if (changes.length === 0) return [];
  return [
    "What changed",
    ...changes.flatMap((change) => [
      "",
      change.label,
      change.current || "(none)",
      `(was: ${change.previous || "none"})`,
    ]),
    "",
  ];
}

function changeSummaryHtml(changes: BookingFieldChange[]) {
  if (changes.length === 0) return "";
  return `<p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:#000000;">What changed</p>
${detailHtml(
  changes.map((change) => ({
    label: change.label,
    value: `${change.current || "(none)"}\n(was: ${change.previous || "none"})`,
    changed: true,
  })),
)}
<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>`;
}

function headingHtml(title: string, subtitle?: string) {
  const titleBlock = `<h1 style="margin:0 0 ${subtitle ? "8px" : "28px"};font-family:${EMAIL_FONT_STACK};font-size:28px;line-height:1.2;font-weight:700;color:#000000;">${escapeHtml(title)}</h1>`;
  if (!subtitle) return titleBlock;
  return `${titleBlock}
<p style="margin:0 0 28px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.45;color:#000000;">${escapeHtml(subtitle)}</p>`;
}

function paragraphHtml(text: string) {
  return `<p style="margin:0 0 20px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;color:#000000;">${escapeHtml(text)}</p>`;
}

function sharedDetailRows(input: BookingConfirmationInput, extras: DetailRow[] = []) {
  const { when, services, notes, accessCodes } = bookingDetails(input);
  const changed = new Set(bookingFieldChanges(input, input.previous).map((change) => change.label));
  return [
    ...extras,
    { label: "When", value: `${when} (${input.timeZone})`, changed: changed.has("When") },
    { label: "Where", value: input.address, changed: changed.has("Where") },
    { label: "Services", value: services, changed: changed.has("Services") },
    { label: "Notes", value: notes, changed: changed.has("Notes") },
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

/** Exact Pepper line on Billy's new-shoot notify email. */
export const PEPPER_NOTIFY_NEW =
  "Pepper instructions - Please notify Billy of this appointment, but do not add it to his calendar as it is automatically entered.";

export const PEPPER_NOTIFY_UPDATED =
  "Pepper instructions - Please notify Billy of this appointment change, but do not add it to his calendar as it is automatically entered.";

export const PEPPER_NOTIFY_CANCELLED =
  "Pepper instructions - Please notify Billy of this cancellation, but do not remove it from his calendar as it is automatically removed.";

function pepperNoteParts(note: string) {
  const separator = " - ";
  const index = note.indexOf(separator);
  if (index === -1) return { label: "Pepper instructions", body: note };
  return { label: note.slice(0, index), body: note.slice(index + separator.length) };
}

function pepperNoteHtml(note: string) {
  const { label, body } = pepperNoteParts(note);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #000000;border-collapse:collapse;">
  <tr>
    <td style="padding:16px 18px;font-family:${EMAIL_FONT_STACK};color:#000000;">
      <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;color:#000000;">${escapeHtml(label)}</div>
      <div style="margin-top:6px;font-size:16px;line-height:1.45;color:#000000;">${escapeHtml(body)}</div>
    </td>
  </tr>
</table>`;
}

function calendarCtaHtml(icsUrl: string, googleUrl: string) {
  return `${bookingEmailCtaButton(icsUrl, "Add to calendar")}
<p style="margin:12px 0 20px;text-align:center;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.45;">
  <a href="${escapeHtml(googleUrl)}" style="color:#000000;text-decoration:underline;">Google Calendar</a>
</p>`;
}

function buildClientMessage(
  input: BookingConfirmationInput,
  copy: {
    title: string;
    intro: string;
    subjectPrefix: string;
    updated?: boolean;
    includeCalendar?: boolean;
    cta?: { label: string; href: string };
    subject?: string;
  },
) {
  const { when } = bookingDetails(input);
  const greeting = clientGreeting(input);
  const changes = bookingFieldChanges(input, input.previous);
  const rows = sharedDetailRows(input);
  const cta = copy.cta ?? clientCta(input, Boolean(copy.updated));
  const bookingId = input.bookingId?.trim();
  const calendar =
    copy.includeCalendar && bookingId
      ? clientCalendarLinks({
          bookingId,
          address: input.address,
          services: input.services,
          start: input.start,
          end: input.end,
          notes: input.notes,
          accessCodes: input.accessCodes,
          updated: Boolean(copy.updated),
        })
      : null;
  const attachments: EmailAttachment[] | undefined = calendar
    ? [
        {
          filename: calendar.filename,
          content: Buffer.from(calendar.ics, "utf8").toString("base64"),
          contentType: "text/calendar; charset=utf-8",
        },
      ]
    : undefined;

  const text = [
    greeting,
    "",
    copy.intro,
    "",
    ...changeSummaryText(changes),
    ...detailText(rows),
    "",
    ...(calendar ? ["Add to calendar", calendar.icsUrl, "", "Google Calendar", calendar.googleUrl, ""] : []),
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
      changeSummaryHtml(changes),
      detailHtml(rows),
      `<div style="padding:28px 0 8px;">${calendar ? calendarCtaHtml(calendar.icsUrl, calendar.googleUrl) : ""}${bookingEmailCtaButton(cta.href, cta.label)}</div>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });

  return {
    subject: copy.subject ?? `${copy.subjectPrefix} — ${when}`,
    text,
    html,
    attachments,
  };
}

function buildNotifyMessage(
  input: BookingConfirmationInput,
  copy: { title: string; subjectPrefix: string; pepperNote?: string },
) {
  const { when } = bookingDetails(input);
  const changes = bookingFieldChanges(input, input.previous);
  const rows = sharedDetailRows(input, [{ label: "Client", value: clientLabel(input) || input.clientEmail }]);
  const cta = notifyCta();
  const pepperNote = copy.pepperNote?.trim() || "";

  const text = [
    ...changeSummaryText(changes),
    ...detailText(rows),
    "",
    cta.label,
    cta.href,
    "",
    ...(pepperNote ? [pepperNote, ""] : []),
    emailSignatureText(),
  ].join("\n");

  const html = wrapBookingEmailHtml({
    title: copy.title,
    preheader: when,
    body: [
      headingHtml(copy.title),
      changeSummaryHtml(changes),
      detailHtml(rows),
      `<div style="padding:28px 0 8px;">${bookingEmailCtaButton(cta.href, cta.label)}</div>`,
      ...(pepperNote ? [`<div style="padding:8px 0 0;">${pepperNoteHtml(pepperNote)}</div>`] : []),
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
    includeCalendar: true,
  });
}

/** Billy's own booking alert. Email #2. */
export function buildBookingNotify(input: BookingConfirmationInput) {
  return buildNotifyMessage(input, {
    title: "New shoot",
    subjectPrefix: "New shoot",
    pepperNote: PEPPER_NOTIFY_NEW,
  });
}

/** Client-facing modification confirmation. Email #1. */
export function buildBookingModified(input: BookingConfirmationInput) {
  const { when } = bookingDetails(input);
  return buildClientMessage(input, {
    title: "Shoot changes",
    intro: "Your shoot with Billy Kyle has been changed.",
    subjectPrefix: "Shoot changes",
    subject: replySubject(input.thread?.originalSubject, `Shoot changes — ${when}`),
    updated: true,
    includeCalendar: true,
  });
}

/** Billy's modification alert. Email #2. */
export function buildBookingModifiedNotify(input: BookingConfirmationInput) {
  return buildNotifyMessage(input, {
    title: "Shoot changes",
    subjectPrefix: "Shoot changes",
    pepperNote: PEPPER_NOTIFY_UPDATED,
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
    title: "Shoot cancelled",
    subjectPrefix: "Shoot cancelled",
    pepperNote: PEPPER_NOTIFY_CANCELLED,
  });
}

export type BookingEmailSendResult = {
  sent: boolean;
  client: Awaited<ReturnType<typeof sendEmail>> | { sent: false; reason: string };
  notify: Awaited<ReturnType<typeof sendEmail>> | { sent: false; reason: string };
  clientMessageId?: string;
  clientSubject?: string;
};

export type BookingEmailSendOptions = {
  /** Skip Billy's standard New shoot / updated / cancelled notify (Pepper copy). */
  skipNotify?: boolean;
};

/**
 * Two separate Resend sends after a successful booking:
 * 1. Client confirmation → session email
 * 2. Billy's copy → BOOKING_NOTIFY_EMAIL (default billy@billyhere.com)
 *
 * No CC/BCC. Soft-fails: never throws, never rolls back the booking.
 * One failed send does not skip the other.
 */
export async function sendBookingConfirmation(
  input: BookingConfirmationInput,
  options?: BookingEmailSendOptions,
): Promise<BookingEmailSendResult> {
  const bookingId = input.bookingId?.trim();
  const messageId = bookingId ? bookingThreadMessageId(bookingId) : undefined;
  return sendBookingPair(input, buildBookingConfirmation(input), buildBookingNotify(input), options, {
    clientHeaders: messageId ? { "Message-ID": messageId } : undefined,
  });
}

/** Same two-send pattern after a client or admin modifies an upcoming booking. */
export async function sendBookingModification(
  input: BookingConfirmationInput,
  options?: BookingEmailSendOptions,
): Promise<BookingEmailSendResult> {
  return sendBookingPair(input, buildBookingModified(input), buildBookingModifiedNotify(input), options, {
    clientHeaders: emailThreadingHeaders(input.thread),
  });
}

/** Same two-send pattern after a client or Billy cancels a confirmed booking. */
export async function sendBookingCancellation(
  input: BookingConfirmationInput,
  options?: BookingEmailSendOptions,
): Promise<BookingEmailSendResult> {
  return sendBookingPair(input, buildBookingCancelled(input), buildBookingCancelledNotify(input), options);
}

export type BookingSyncIssueInput = BookingConfirmationInput & {
  action: BookingSyncAction;
  failures: readonly BookingSyncFailure[];
};

/** Billy-only alert when calendar or confirmation mail failed. No Pepper calendar claim. */
export function buildBookingSyncIssue(input: BookingSyncIssueInput) {
  const details = bookingDetails(input);
  const copy = bookingSyncIssueLines({
    action: input.action,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    address: input.address,
    services: details.services,
    start: input.start,
    end: input.end,
    timeZone: input.timeZone,
    failures: input.failures,
  });
  const rows = copy.rows;
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
    title: BOOKING_SYNC_ISSUE_SUBJECT,
    preheader: copy.intro,
    body: [
      headingHtml(BOOKING_SYNC_ISSUE_SUBJECT),
      paragraphHtml(copy.intro),
      detailHtml(rows),
      `<div style="padding:28px 0 8px;">${bookingEmailCtaButton(cta.href, cta.label)}</div>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });

  return {
    subject: copy.subject,
    text,
    html,
  };
}

/** Owner notify path with one retry. Used when the standard New shoot mail is skipped or failed. */
export async function sendBookingSyncIssue(input: BookingSyncIssueInput): Promise<SendEmailResult> {
  const message = buildBookingSyncIssue(input);
  const first = await sendOwnerNotify(message);
  if (first.sent) return first;
  return sendOwnerNotify(message);
}

async function sendOwnerNotify(message: { subject: string; text: string; html: string }): Promise<SendEmailResult> {
  if (!emailConfigured()) return { sent: false, reason: "resend-unconfigured" };
  const [notify] = uniqueEmails([bookingNotifyEmail()]);
  if (!notify) return { sent: false, reason: "no-recipients" };
  return sendEmail({
    to: notify,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendBookingPair(
  input: BookingConfirmationInput,
  clientMessage: { subject: string; text: string; html: string; attachments?: EmailAttachment[] },
  notifyMessage: { subject: string; text: string; html: string },
  options?: BookingEmailSendOptions,
  sendMeta?: { clientHeaders?: Record<string, string> },
): Promise<BookingEmailSendResult> {
  if (!emailConfigured()) {
    const skipped = { sent: false as const, reason: "resend-unconfigured" };
    return { sent: false, client: skipped, notify: skipped };
  }

  const recipients = bookingConfirmationRecipients(input.clientEmail);
  const skipNotify = Boolean(options?.skipNotify);

  const [client, notify] = await Promise.all([
    recipients.client
      ? sendEmail({
          to: recipients.client,
          subject: clientMessage.subject,
          text: clientMessage.text,
          html: clientMessage.html,
          attachments: clientMessage.attachments,
          headers: sendMeta?.clientHeaders,
        })
      : Promise.resolve({ sent: false as const, reason: "no-recipients" }),
    skipNotify
      ? Promise.resolve({ sent: false as const, reason: "skipped" })
      : recipients.notify
        ? sendEmail({
            to: recipients.notify,
            subject: notifyMessage.subject,
            text: notifyMessage.text,
            html: notifyMessage.html,
          })
        : Promise.resolve({ sent: false as const, reason: "no-recipients" }),
  ]);

  return {
    sent: client.sent && (skipNotify || notify.sent),
    client,
    notify,
    clientMessageId: client.sent
      ? ("messageId" in client ? client.messageId : undefined) ?? sendMeta?.clientHeaders?.["Message-ID"]
      : undefined,
    clientSubject: client.sent ? clientMessage.subject : undefined,
  };
}
