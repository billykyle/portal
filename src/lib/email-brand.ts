import { DEFAULT_PORTAL_ORIGIN } from "@/lib/hosts";

/** System stack that prefers SF Pro on Apple Mail without shipping webfonts. */
export const EMAIL_FONT_STACK =
  "'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Locked Pepper signature links. Labels are hyperlinked; never print raw URLs beside them in HTML. */
export const EMAIL_SIGNATURE_LINKS = [
  { label: "Website", href: "http://www.billy-kyle.com/" },
  { label: "YouTube", href: "https://www.youtube.com/c/billykyle" },
  { label: "X", href: "https://twitter.com/billykyle" },
  { label: "Instagram", href: "https://www.instagram.com/billykyle/" },
] as const;

/** Stable public BK mark on the production portal host. */
export const BOOKING_EMAIL_LOGO_URL = `${DEFAULT_PORTAL_ORIGIN}/brand/bk-logo-white.png`;

const EMAIL_WIDTH = 600;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function emailSignatureHtml() {
  const links = EMAIL_SIGNATURE_LINKS.map(
    ({ label, href }) =>
      `<a href="${escapeHtml(href)}" style="color:#000000;text-decoration:underline;">${escapeHtml(label)}</a>`,
  ).join(" | ");
  return `<p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.6;color:#000000;">—<br>Billy Kyle<br>${links}</p>`;
}

export function emailSignatureText() {
  return [
    "—",
    "Billy Kyle",
    EMAIL_SIGNATURE_LINKS.map(({ label }) => label).join(" | "),
    ...EMAIL_SIGNATURE_LINKS.map(({ label, href }) => `${label}: ${href}`),
  ].join("\n");
}

export function bookingEmailCtaButton(href: string, label: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="#000000" style="background:#000000;border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function wrapBookingEmailHtml(input: { title: string; preheader?: string; body: string }) {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#000000;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:1.5;">
${preheader}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="${EMAIL_WIDTH}" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${EMAIL_WIDTH}px;background:#ffffff;">
        <tr>
          <td align="center" bgcolor="#000000" style="background:#000000;padding:28px 24px;">
            <img src="${escapeHtml(BOOKING_EMAIL_LOGO_URL)}" width="56" alt="Billy Kyle" style="display:block;border:0;width:56px;height:auto;">
          </td>
        </tr>
        <tr>
          <td style="padding:36px 28px 40px;font-family:${EMAIL_FONT_STACK};color:#000000;">
${input.body}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
