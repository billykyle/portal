import assert from "node:assert/strict";
import { test } from "node:test";
import { emailActionButton, emailActionButtons, wrapBookingEmailHtml } from "./email-brand";

test("email action buttons are inline, table-based, and stack under a media query", () => {
  const row = emailActionButtons([
    { href: "https://portal.billy-kyle.com/modify", label: "Modify", variant: "primary" },
    { href: "https://portal.billy-kyle.com/cancel", label: "Cancel", variant: "secondary" },
  ]);
  const html = wrapBookingEmailHtml({ title: "Shoot reminder", body: row });

  assert.match(row, /bgcolor="#000000"/);
  assert.match(row, /bgcolor="#ffffff"/);
  assert.match(row, /border:1px solid #8e8e93/);
  assert.match(row, /border-radius:12px/);
  assert.match(row, /class="email-action-stack"/);
  assert.match(row, /href="https:\/\/portal\.billy-kyle\.com\/modify"/);
  assert.match(row, /href="https:\/\/portal\.billy-kyle\.com\/cancel"/);
  assert.doesNotMatch(row, /class="[^"]*btn/);
  assert.match(html, /max-width: 480px/);
  assert.match(html, /\.email-action-stack/);

  const single = emailActionButton({ href: "https://portal.billy-kyle.com/admin/bookings", label: "View bookings" });
  assert.match(single, /bgcolor="#000000"/);
  assert.match(single, />View bookings</);
  assert.doesNotMatch(single, /width="100%"/);
});
