import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("admin client page loads media for that client's shoots only", () => {
  const page = readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8");
  assert.match(page, /inArray\(\s*media\.shootId/);
  assert.doesNotMatch(page, /db\.select\(\)\.from\(media\)\s*;/);
});

test("directory pages count shoots and do not also count every login", () => {
  for (const file of ["src/app/admin/home/page.tsx", "src/app/admin/clients/page.tsx"]) {
    const page = readFileSync(file, "utf8");
    assert.match(page, /shootCountsByClient\(/);
    assert.doesNotMatch(page, /clientCounts\(/);
  }
});

test("admin home reuses the booking list for the book-a-shoot calendar", () => {
  const page = readFileSync("src/app/admin/home/page.tsx", "utf8");
  assert.match(page, /listAdminBookings\(/);
  assert.doesNotMatch(page, /from\(bookings\)/);
  assert.match(page, /job\.status === "confirmed"/);
});

test("travel lookups do not read booking notes or mail columns", () => {
  const source = readFileSync("src/lib/scheduling/bookings.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function loadConfirmedPortalJobs"));
  const body = fn.slice(0, fn.indexOf("export async function getBookingById"));
  assert.match(body, /id: bookings\.id/);
  assert.match(body, /address: bookings\.address/);
  assert.doesNotMatch(body, /notes:|syncIssue:|select\(\)/);
});

test("reminder and booking mail ask only for the clients they need", () => {
  const source = readFileSync("src/lib/user-portals.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function memberEmailsForClients"));
  const body = fn.slice(0, fn.indexOf("export async function addExtraInviteCode"));
  assert.match(body, /inArray\(users\.clientId, ids\)/);
  assert.match(body, /inArray\(userClients\.clientId, ids\)/);
  assert.doesNotMatch(body, /directoryLogins\(/);
});

test("shoot pages share one lookup between metadata and the render", () => {
  for (const file of [
    "src/app/my-content/[slug]/page.tsx",
    "src/app/admin/clients/[id]/shoots/[slug]/page.tsx",
  ]) {
    const page = readFileSync(file, "utf8");
    assert.match(page, /resolveShootForPage/);
    assert.doesNotMatch(page, /resolveClientShoot/);
  }
  assert.match(readFileSync("src/lib/resolve-shoot-page.ts", "utf8"), /cache\(resolveClientShoot\)/);
});
