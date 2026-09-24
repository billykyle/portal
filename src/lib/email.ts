import { isPendingClientEmail } from "@/lib/signup-fields";

/**
 * Shared Resend sender for password reset and booking confirm / modify / cancel.
 * Delivery webhooks (Pepper) stay separate — this is portal mail only.
 */

export const DEFAULT_EMAIL_FROM = "Billy Kyle <billy@billyhere.com>";
export const DEFAULT_BOOKING_NOTIFY_EMAIL = "billy@billyhere.com";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function resendApiKey() {
  return process.env.RESEND_API_KEY?.trim() || "";
}

export function emailConfigured() {
  return Boolean(resendApiKey());
}

/** From address when Resend is set. Locked default once configured. */
export function emailFrom() {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
}

export function bookingNotifyEmail() {
  return process.env.BOOKING_NOTIFY_EMAIL?.trim() || DEFAULT_BOOKING_NOTIFY_EMAIL;
}

export function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    const email = normalizeEmail(value);
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
};

export type SendEmailResult =
  | { sent: true; id?: string; messageId?: string }
  | { sent: false; reason: string };

function asList(value: string | string[] | undefined) {
  return uniqueEmails(Array.isArray(value) ? value : [value]);
}

export const CLIENT_EMAIL_SKIPPED_PLACEHOLDER = "CLIENT_EMAIL_SKIPPED_PLACEHOLDER";

/** Drop `@pending.local` so a NAS placeholder can never be a Resend recipient. */
export function deliverableRecipients(value: string | string[] | undefined) {
  const requested = asList(value);
  const to = requested.filter((email) => !isPendingClientEmail(email));
  const dropped = requested.filter((email) => isPendingClientEmail(email));
  return { to, dropped };
}

/**
 * POST one message to Resend. Soft-fails: never throws.
 * No-op when `RESEND_API_KEY` is unset.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = resendApiKey();
  if (!key) return { sent: false, reason: "resend-unconfigured" };

  const { to, dropped } = deliverableRecipients(input.to);
  if (dropped.length > 0) {
    console.error(
      CLIENT_EMAIL_SKIPPED_PLACEHOLDER,
      JSON.stringify({ dropped, subject: input.subject }),
    );
  }
  if (to.length === 0) {
    return { sent: false, reason: dropped.length > 0 ? "placeholder-recipient" : "no-recipients" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((file) => ({
                filename: file.filename,
                content: file.content,
                ...(file.contentType ? { content_type: file.contentType } : {}),
              })),
            }
          : {}),
        ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Resend ${res.status}${body ? `: ${body}` : ""}`);
      return { sent: false, reason: `resend-${res.status}` };
    }
    const payload = (await res.json().catch(() => ({}))) as { id?: string };
    const headerMessageId = input.headers?.["Message-ID"] ?? input.headers?.["Message-Id"];
    return {
      sent: true,
      ...(payload.id ? { id: payload.id } : {}),
      ...(headerMessageId ? { messageId: headerMessageId } : {}),
    };
  } catch (error) {
    console.error("Resend send failed", error);
    return { sent: false, reason: "resend-error" };
  }
}
