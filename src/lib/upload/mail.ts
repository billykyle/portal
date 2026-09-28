import { emailSignatureHtml, emailSignatureText, wrapBookingEmailHtml } from "@/lib/email-brand";
import { bookingNotifyEmail } from "@/lib/email";

export type UploadNotice = {
  name: string;
  label: string;
  email: string;
  fileCount: number;
  totalBytes: number;
  nasPath: string;
  reason?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function lines(notice: UploadNotice, extra?: string) {
  return [
    `Name: ${notice.name}`,
    `Email: ${notice.email}`,
    `What: ${notice.label}`,
    `Files: ${notice.fileCount}`,
    `Size: ${formatBytes(notice.totalBytes)}`,
    `Folder: ${notice.nasPath || "—"}`,
    ...(extra ? ["", extra] : []),
  ];
}

function htmlLines(notice: UploadNotice, extra?: string) {
  const rows = lines(notice)
    .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`)
    .join("");
  const more = extra ? `<p style="margin:16px 0 0;">${escapeHtml(extra)}</p>` : "";
  return `${rows}${more}<div style="padding-top:24px;">${emailSignatureHtml()}</div>`;
}

export function filesReceivedMessage(notice: UploadNotice) {
  const text = [...lines(notice), "", emailSignatureText()].join("\n");
  return {
    to: bookingNotifyEmail(),
    subject: "Files received",
    text,
    html: wrapBookingEmailHtml({
      title: "Files received",
      preheader: notice.label,
      body: htmlLines(notice),
    }),
  };
}

export function moveFailedMessage(notice: UploadNotice) {
  const reason = notice.reason?.trim() || "The copy onto the NAS did not finish.";
  const extra = `${reason} The files are still in cloud storage.`;
  const text = [...lines(notice, extra), "", emailSignatureText()].join("\n");
  return {
    to: bookingNotifyEmail(),
    subject: "Upload move failed",
    text,
    html: wrapBookingEmailHtml({
      title: "Upload move failed",
      preheader: notice.label,
      body: htmlLines(notice, extra),
    }),
  };
}
