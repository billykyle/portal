import {
  EMAIL_FONT_STACK,
  emailSignatureHtml,
  emailSignatureText,
  wrapBookingEmailHtml,
} from "@/lib/email-brand";
import { uniqueEmails } from "@/lib/email";
import { isPendingClientEmail } from "@/lib/signup-fields";
import { utcToZonedParts, zonedDateTimeToUtc } from "@/lib/scheduling/zoned-time";

export const MAINTENANCE_TIME_ZONE = "America/New_York";
export const MAINTENANCE_NOTICE_ID = "current";

export type MaintenanceWindow = {
  message: string;
  startsAt: Date;
  endsAt: Date;
};

export function maintenanceIsLive(notice: Pick<MaintenanceWindow, "startsAt" | "endsAt"> | null, now: Date) {
  if (!notice) return false;
  return notice.startsAt.getTime() <= now.getTime() && now.getTime() <= notice.endsAt.getTime();
}

/** `datetime-local` value, read as Eastern wall time. */
export function parseEtDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return zonedDateTimeToUtc(MAINTENANCE_TIME_ZONE, { year, month, day, hour, minute, second: 0 });
}

export function formatEtDateTimeLocal(date: Date) {
  const parts = utcToZonedParts(date, MAINTENANCE_TIME_ZONE);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatMaintenanceWindow(start: Date, end: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: MAINTENANCE_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(start)} – ${fmt.format(end)} ET`;
}

/** Real primary emails, deduped. Placeholders never leave this list. */
export function maintenanceRecipients(emails: Array<string | null | undefined>) {
  return uniqueEmails(emails).filter((email) => !isPendingClientEmail(email));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildMaintenanceEmail(input: MaintenanceWindow) {
  const windowLabel = formatMaintenanceWindow(input.startsAt, input.endsAt);
  const message = input.message.trim();
  const subject = `Scheduled maintenance — ${windowLabel}`;
  const text = [message, "", windowLabel, "", emailSignatureText()].join("\n");
  const html = wrapBookingEmailHtml({
    title: "Scheduled maintenance",
    preheader: windowLabel,
    body: [
      `<h1 style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};font-size:28px;line-height:1.2;font-weight:700;color:#000000;">Scheduled maintenance</h1>`,
      `<p style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;color:#000000;">${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
      `<p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;font-weight:700;color:#000000;">${escapeHtml(windowLabel)}</p>`,
      `<div style="padding-top:24px;">${emailSignatureHtml()}</div>`,
    ].join("\n"),
  });
  return { subject, text, html };
}
