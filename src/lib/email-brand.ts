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

export type EmailActionVariant = "primary" | "secondary";

export type EmailAction = {
  href: string;
  label: string;
  variant?: EmailActionVariant;
};

const EMAIL_ACTION_STYLES = {
  primary: { bg: "#000000", color: "#ffffff", border: "#000000" },
  secondary: { bg: "#ffffff", color: "#000000", border: "#8e8e93" },
} as const;

/**
 * One action control. Colors, type, and radius are inline so the button
 * still renders when a client drops `<style>` blocks. Outlook gets a VML
 * roundrect; everyone else gets the anchor.
 */
export function emailActionButton(action: EmailAction, fluid = false) {
  const variant = action.variant ?? "primary";
  const style = EMAIL_ACTION_STYLES[variant];
  const href = escapeHtml(action.href);
  const label = escapeHtml(action.label);
  const width = fluid ? ` width="100%"` : "";
  return `<table role="presentation"${width} cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
  <tr>
    <td align="center" valign="middle" bgcolor="${style.bg}" style="border-radius:12px;background-color:${style.bg};border:1px solid ${style.border};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="25%" strokecolor="${style.border}" strokeweight="1px" fillcolor="${style.bg}">
        <w:anchorlock/>
        <center style="color:${style.color};font-family:Segoe UI, Helvetica, Arial, sans-serif;font-size:16px;font-weight:bold;">${label}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${href}" target="_blank" style="display:${fluid ? "block" : "inline-block"};padding:14px 22px;font-family:${EMAIL_FONT_STACK};font-size:16px;line-height:20px;font-weight:500;color:${style.color};text-decoration:none;border-radius:12px;">${label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** One centered button, or a row that sits side by side and stacks under 480px. */
export function emailActionButtons(actions: EmailAction[]) {
  if (actions.length === 0) return "";
  if (actions.length === 1) {
    const action = actions[0]!;
    return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center">${emailActionButton(action, false)}</td>
  </tr>
</table>`;
  }
  const width = Math.floor(100 / actions.length);
  const cells = actions
    .map((action, index) => {
      const padding =
        index === 0
          ? "padding:0 6px 0 0;"
          : index === actions.length - 1
            ? "padding:0 0 0 6px;"
            : "padding:0 6px;";
      return `<td class="email-action-stack" valign="middle" width="${width}%" style="${padding}">
      ${emailActionButton(action, true)}
    </td>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
    ${cells}
  </tr>
</table>`;
}

export function bookingEmailCtaButton(href: string, label: string) {
  return emailActionButtons([{ href, label, variant: "primary" }]);
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
<style>
  @media only screen and (max-width: 480px) {
    .email-action-stack {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      padding: 0 0 12px 0 !important;
    }
  }
</style>
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
