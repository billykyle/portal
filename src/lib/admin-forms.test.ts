import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminUserProfileForm } from "../components/forms/admin-user-profile-form";
import { CancelBookingForm } from "../components/forms/cancel-booking-form";
import { SyncNasForm } from "../components/forms/sync-nas-form";
import { nasSyncPageNotice } from "./admin/sync-notice";
import { NAS_UNREACHABLE_MESSAGE } from "./nas-connect";
import { ShootList } from "../components/shoot-list";

test("admin UI does not offer mark delivered", () => {
  const files = [
    "src/app/shoots/[id]/page.tsx",
    "src/app/admin/clients/[id]/page.tsx",
    "src/lib/actions/admin.ts",
    "src/components/shoot-list.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Mark delivered|Marked delivered|markShootDelivered|deliveredAt/);
  }
});

test("admin UI does not offer a manual attach-shoot form", () => {
  const files = ["src/app/admin/clients/[id]/page.tsx", "src/lib/actions/admin.ts"];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Attach shoot|attachShoot|AttachShootForm/);
  }
  assert.equal(existsSync("src/components/forms/attach-shoot-form.tsx"), false);
  assert.equal(existsSync("src/app/api/admin/shoots/route.ts"), false);
  const sync = readFileSync("src/components/forms/sync-nas-form.tsx", "utf8");
  assert.match(sync, /Sync from NAS/);
});

test("a NAS sync failure stays on the sync section with a readable error", () => {
  const action = readFileSync("src/lib/actions/admin.ts", "utf8");
  assert.match(action, /syncError: readableNasError\(result\.error\)/);
  assert.match(action, /readableNasError\(error\)/);
  const sync = readFileSync("src/lib/admin/sync.ts", "utf8");
  assert.match(sync, /readableNasError/);
  const page = readFileSync("src/app/admin/clients/page.tsx", "utf8");
  assert.match(page, /nasSyncPageNotice/);
  assert.match(page, /error=\{syncNotice\.syncError/);
  assert.match(page, /status=/);
  assert.match(page, /Sync finished/);
  assert.doesNotMatch(page, /\{syncError\}/);
  assert.doesNotMatch(page, /\{error \?/);
});

test("raw relay text renders as the friendly sync message under the button", () => {
  const fromSyncParam = nasSyncPageNotice({ syncError: "connect to device timeout" });
  assert.equal(fromSyncParam.syncError, NAS_UNREACHABLE_MESSAGE);
  assert.equal(fromSyncParam.topError, "");

  const fromPageBanner = nasSyncPageNotice({ error: "connect to device timeout" });
  assert.equal(fromPageBanner.syncError, NAS_UNREACHABLE_MESSAGE);
  assert.equal(fromPageBanner.topError, "");

  const other = nasSyncPageNotice({ error: "Name is required." });
  assert.equal(other.syncError, "");
  assert.equal(other.topError, "Name is required.");

  const html = renderToStaticMarkup(
    createElement(SyncNasForm, {
      error: NAS_UNREACHABLE_MESSAGE,
      status: "Sync finished. 1 new client, 0 new shoots, 2 new photos. Reused 0 clients / 0 shoots.",
    }),
  );
  const buttonAt = html.indexOf("Sync from NAS");
  const alertAt = html.indexOf("reach the NAS");
  const statusAt = html.indexOf("Sync finished.");
  assert.ok(buttonAt >= 0);
  assert.ok(alertAt > buttonAt);
  assert.ok(statusAt > buttonAt);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /connect to device timeout/);
});

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
