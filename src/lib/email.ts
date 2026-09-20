/**
 * Shared Resend sender for password reset and booking confirmation.
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

export type SendEmailInput = {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

function asList(value: string | string[] | undefined) {
  return uniqueEmails(Array.isArray(value) ? value : [value]);
}

/**
 * POST one message to Resend. Soft-fails: never throws.
 * No-op when `RESEND_API_KEY` is unset.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = resendApiKey();
  if (!key) return { sent: false, reason: "resend-unconfigured" };

  const to = asList(input.to);
  if (to.length === 0) return { sent: false, reason: "no-recipients" };
  const bcc = asList(input.bcc).filter((email) => !to.includes(email));

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
        ...(bcc.length > 0 ? { bcc } : {}),
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Resend ${res.status}${body ? `: ${body}` : ""}`);
      return { sent: false, reason: `resend-${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("Resend send failed", error);
    return { sent: false, reason: "resend-error" };
  }
}
