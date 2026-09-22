import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminUserProfileForm } from "../components/forms/admin-user-profile-form";
import { CancelBookingForm } from "../components/forms/cancel-booking-form";
import { SyncNasForm } from "../components/forms/sync-nas-form";
import { ShootList } from "../components/shoot-list";

test("admin NAS sync form keeps the button and drops the instructional blurb", () => {
  const html = renderToStaticMarkup(createElement(SyncNasForm));
  assert.match(html, /Sync from NAS/);
  assert.doesNotMatch(html, /source of truth/);
  assert.doesNotMatch(html, /Client Deliverables/);
  assert.doesNotMatch(html, /every 10 minutes/);
});

test("admin profile form edits Account fields and explains the sign-in email", () => {
  const html = renderToStaticMarkup(
    createElement(AdminUserProfileForm, {
      clientId: "client-1",
      userId: "user-1",
      firstName: "Sam",
      lastName: "Lepore",
      companyName: "Lepore Realty",
      phone: "6095550100",
      email: "sam@example.com",
    }),
  );
  assert.match(html, /name="firstName"/);
  assert.match(html, /name="lastName"/);
  assert.match(html, /name="companyName"/);
  assert.match(html, /name="phone"/);
  assert.match(html, /name="email"/);
  assert.match(html, /value="sam@example.com"/);
  assert.match(html, /sign-in email/);
  assert.match(html, /Save profile/);
  assert.doesNotMatch(html, /readOnly|readonly/i);
});

test("admin shoot list has no delete control", () => {
  const html = renderToStaticMarkup(
    createElement(ShootList, {
      variant: "admin",
      emptyLabel: "No shoots attached yet.",
      shoots: [
        {
          id: "shoot-1",
          href: "/shoots/shoot-1",
          address: "12 Wood View Drive",
          shotDate: "2026-09-04",
          dateLabel: "Sep 4, 2026",
          fileCount: 3,
          publicToken: "token",
        },
      ],
    }),
  );
  assert.match(html, /12 Wood View Drive/);
  assert.match(html, /Copy link/);
  assert.doesNotMatch(html, /Delete shoot/);
});

test("cancel booking stays available", () => {
  const html = renderToStaticMarkup(createElement(CancelBookingForm, { bookingId: "booking-1", fromAdmin: true }));
  assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /Delete/);
});
