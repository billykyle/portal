import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clientMatchesQuery,
  confirmDeleteClient,
  notesSummary,
  selectBookings,
  summarizeMedia,
  toPublicUser,
} from "./present";

test("notesSummary collapses whitespace and truncates", () => {
  assert.equal(notesSummary("  Sam\n\nLepore  "), "Sam Lepore");
  assert.equal(notesSummary(null), "");
  const long = "a".repeat(200);
  const summary = notesSummary(long, 20);
  assert.equal(summary.length <= 20, true);
  assert.ok(summary.endsWith("…"));
});

test("client search matches invite code, name, company, and email", () => {
  const client = {
    inviteCode: "BK00004",
    displayName: "Sam Lepore",
    company: "Lepore Realty",
    primaryEmail: "sam@example.com",
  };
  assert.equal(clientMatchesQuery(client, " bk00004 "), true);
  assert.equal(clientMatchesQuery(client, "lepore realty"), true);
  assert.equal(clientMatchesQuery(client, "missing"), false);
  assert.equal(clientMatchesQuery(client, "  "), true);
});

test("public user drops the password hash", () => {
  const user = toPublicUser(
    {
      id: "user-1",
      clientId: "client-1",
      email: "sam@example.com",
      firstName: "Sam",
      lastName: "Lepore",
      phone: "6095550100",
      createdAt: new Date("2026-09-04T15:00:00.000Z"),
      passwordHash: "secret-hash",
    },
    "Lepore Realty",
  );
  assert.equal("passwordHash" in user, false);
  assert.equal(JSON.stringify(user).includes("secret-hash"), false);
  assert.equal(user.company, "Lepore Realty");
  assert.equal(user.createdAt, "2026-09-04T15:00:00.000Z");
});

test("media inventory counts types and treats an empty shoot as not ready", () => {
  const summary = summarizeMedia([
    { id: "p1", type: "photo", filename: "b.jpg", sortOrder: 2 },
    { id: "p2", type: "photo", filename: "a.jpg", sortOrder: 1 },
    { id: "f1", type: "floor_plan", filename: "plan.pdf", sortOrder: 1 },
    { id: "v1", type: "video", filename: "walk.mp4", sortOrder: 1 },
  ]);
  assert.deepEqual(summary.counts, { photo: 2, floor_plan: 1, video: 1, total: 4 });
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.photos.map((item) => item.id), ["p2", "p1"]);
  assert.equal(summarizeMedia([]).ready, false);
});

test("booking filter splits upcoming and past and hides cancelled unless asked", () => {
  const now = new Date("2026-09-24T15:00:00.000Z");
  const rows = [
    { id: "past", startsAt: new Date("2026-09-01T15:00:00.000Z"), status: "confirmed", clientId: "c1" },
    { id: "next", startsAt: new Date("2026-09-30T15:00:00.000Z"), status: "confirmed", clientId: "c1" },
    { id: "other", startsAt: new Date("2026-10-01T15:00:00.000Z"), status: "confirmed", clientId: "c2" },
    { id: "gone", startsAt: new Date("2026-10-02T15:00:00.000Z"), status: "cancelled", clientId: "c1" },
  ];
  assert.deepEqual(
    selectBookings(rows, { now, when: "upcoming", limit: 50 }).map((row) => row.id),
    ["next", "other"],
  );
  assert.deepEqual(
    selectBookings(rows, { now, when: "past", clientId: "c1", limit: 50 }).map((row) => row.id),
    ["past"],
  );
  assert.deepEqual(
    selectBookings(rows, { now, when: "all", includeCancelled: true, clientId: "c1", limit: 1 }).map((row) => row.id),
    ["past"],
  );
});

test("delete confirmation requires the invite code", () => {
  assert.equal(confirmDeleteClient("BK00004", "BK00004"), null);
  assert.equal(confirmDeleteClient("BK00004", "bk 00004"), null);
  assert.match(confirmDeleteClient("BK00004", "BK00005") ?? "", /confirmInviteCode/);
});
