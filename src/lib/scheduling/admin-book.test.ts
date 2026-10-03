import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultBookingIntegrationDeps, settleBookingIntegrations } from "./booking-integrations";
import {
  createOverrideBooking,
  resolveBookingClient,
  type BookingClientRecord,
  type OverrideBookingDeps,
  type OverrideBookingSource,
} from "./admin-book";
import { COMMERCIAL_VIDEO_HOURS_ERROR } from "./services";
import { DEFAULT_TIMEZONE } from "./rules";
import { utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";

const samId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

function client(overrides: Partial<BookingClientRecord> = {}): BookingClientRecord {
  return {
    id: samId,
    inviteCode: "BK00004",
    displayName: "Sam Lepore",
    company: "Lepore Realty",
    primaryEmail: "sam@example.com",
    logins: [
      {
        email: "sam.login@example.com",
        firstName: "Sam",
        lastName: "Lepore",
        phone: "609-555-0104",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

const rows = [
  client(),
  client({
    id: otherId,
    inviteCode: "BK00005",
    displayName: "Sam Lepore",
    company: "Other Co",
    primaryEmail: "other@example.com",
  }),
  client({
    id: "33333333-3333-4333-8333-333333333333",
    inviteCode: "BK00002",
    displayName: "Justin Heath",
    company: null,
    primaryEmail: "justin.heath@pending.local",
    logins: [],
  }),
];

test("client resolution is exact and lists close matches instead of guessing", () => {
  assert.equal(resolveBookingClient(samId, [client()]).ok, true);
  const byCode = resolveBookingClient("bk00004", [client()]);
  assert.equal(byCode.ok && byCode.client.inviteCode, "BK00004");
  const byName = resolveBookingClient("sam lepore", [client()]);
  assert.equal(byName.ok && byName.client.id, samId);

  const ambiguous = resolveBookingClient("Sam Lepore", rows);
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) {
    assert.match(ambiguous.error, /More than one client/);
    assert.match(ambiguous.error, /BK00004/);
    assert.match(ambiguous.error, /BK00005/);
  }

  const unknown = resolveBookingClient("Lepore", [client()]);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.match(unknown.error, /No client matched/);
    assert.match(unknown.error, /Sam Lepore \(BK00004/);
  }

  const missingCode = resolveBookingClient("BK99999", [client()]);
  assert.equal(missingCode.ok, false);
  if (!missingCode.ok) assert.match(missingCode.error, /BK99999/);
});

test("admin and agent can book Construction overnight", async () => {
  const bookedWindow: { start: Date | null; end: Date | null } = { start: null, end: null };
  const booked = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Construction · Photography", "Construction · Video"],
      date: "2026-09-23",
      time: "2:15am",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [],
      insertBooking: async (row) => {
        bookedWindow.start = row.startsAt;
        bookedWindow.end = row.endsAt;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      settle: async () => ({
        issues: { calendar: false, email: false, alertFailed: false },
        calendarEventId: null,
        billyNotified: false,
        alertSent: false,
      }),
      calendarOn: () => false,
    },
  );
  assert.equal(booked.ok, true);
  const { start, end } = bookedWindow;
  assert.equal(start?.toISOString(), zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year: 2026, month: 9, day: 23, hour: 2, minute: 15 }).toISOString());
  assert.equal(end && start ? end.getTime() - start.getTime() : 0, (45 + 45) * 60 * 1000);
});

test("commercial video override refuses a missing length and occupies the chosen hours", async () => {
  const missing = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Commercial video"],
      date: "2026-09-22",
      time: "9am",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [],
      insertBooking: async () => {
        throw new Error("should not insert");
      },
      settle: async () => {
        throw new Error("should not settle");
      },
      calendarOn: () => false,
    },
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, COMMERCIAL_VIDEO_HOURS_ERROR);

  let occupied = 0;
  let storedHours: number | null = null;
  const booked = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Commercial video"],
      commercialHours: 5,
      date: "2026-09-22",
      time: "9am",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [],
      insertBooking: async (row) => {
        occupied = row.endsAt.getTime() - row.startsAt.getTime();
        storedHours = row.commercialVideoHours;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      settle: async () => ({
        issues: { calendar: false, email: false, alertFailed: false },
        calendarEventId: "evt_commercial",
        billyNotified: false,
        alertSent: false,
      }),
      calendarOn: () => true,
    },
  );
  assert.equal(booked.ok, true);
  assert.equal(occupied, 5 * 60 * 60 * 1000);
  assert.equal(storedHours, 5);
});

test("override booking ignores weekday, same-day, grid, hours, and drive time", async () => {
  for (const source of ["admin-ui", "agent"] as const) {
    const seen = await book(source, {
      jobs: [{ start: et(2026, 9, 22, 18, 0), end: et(2026, 9, 22, 19, 39) }],
    });
    assert.equal(seen.inserted?.driveSecondsFromPrior, null);
    const parts = utcToZonedParts(seen.inserted!.startsAt, DEFAULT_TIMEZONE);
    assert.deepEqual(
      { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute },
      { year: 2026, month: 9, day: 22, hour: 19, minute: 40 },
    );
    assert.equal(seen.inserted!.endsAt.getTime() - seen.inserted!.startsAt.getTime(), 45 * 60 * 1000);
    assert.equal(seen.result.ok && seen.result.overlapWarning, null);
    assert.equal(seen.result.ok && seen.result.startEt, "Tue, Sep 22 at 7:40 PM");
    assert.equal(seen.skipOwnerNotify, true);
    assert.equal(seen.ownerMails, 0);
    assert.ok(seen.recipients.includes("sam.login@example.com"));
    assert.ok(seen.recipients.includes("pat@example.com"));
    assert.equal(seen.recipients.includes("billy@billyhere.com"), false);
    assert.equal(seen.summary, "Sam Lepore - P (Lockbox 2222. pat@example.com)");
    assert.match(seen.description, /Services: Real Estate · Photography/);
    assert.doesNotMatch(seen.summary, /Real Estate|Construction/);
    assert.match(seen.description, /Booked through your portal/);
  }
});

test("admin and agent can book a start that is already in the past", async () => {
  for (const source of ["admin-ui", "agent"] as const) {
    const earlierDate = await book(source, {
      jobs: [],
      date: "2024-03-06",
      time: "10:30am",
      notes: "",
    });
    assert.equal(earlierDate.result.ok, true);
    const parts = utcToZonedParts(earlierDate.inserted!.startsAt, DEFAULT_TIMEZONE);
    assert.deepEqual(
      { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute },
      { year: 2024, month: 3, day: 6, hour: 10, minute: 30 },
    );
    assert.ok(earlierDate.inserted!.startsAt.getTime() < Date.now());
    assert.equal(earlierDate.summary, "Sam Lepore - P");
    assert.match(earlierDate.description, /Services: Real Estate · Photography/);
    assert.doesNotMatch(earlierDate.summary, /Real Estate|Construction/);

    const now = new Date();
    const earlier = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const zoned = utcToZonedParts(earlier, DEFAULT_TIMEZONE);
    const date = `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`;
    const hour12 = zoned.hour % 12 || 12;
    const time = `${hour12}:${String(zoned.minute).padStart(2, "0")}${zoned.hour >= 12 ? "pm" : "am"}`;
    const earlierToday = await book(source, { jobs: [], date, time, notes: "gate code 1234" });
    assert.equal(earlierToday.result.ok, true);
    assert.ok(earlierToday.inserted!.startsAt.getTime() < Date.now());
    const saved = utcToZonedParts(earlierToday.inserted!.startsAt, DEFAULT_TIMEZONE);
    assert.equal(saved.year, zoned.year);
    assert.equal(saved.month, zoned.month);
    assert.equal(saved.day, zoned.day);
    assert.equal(saved.hour, zoned.hour);
    assert.equal(saved.minute, zoned.minute);
    assert.equal(earlierToday.summary, "Sam Lepore - P (gate code 1234)");
  }
});

test("an overlapping booking warns and still saves, from either path", async () => {
  for (const source of ["admin-ui", "agent"] as const) {
    const seen = await book(source, {
      jobs: [{ start: et(2026, 9, 22, 19, 30), end: et(2026, 9, 22, 20, 0) }],
    });
    assert.equal(seen.result.ok, true);
    assert.equal(seen.result.ok && seen.result.overlapWarning, "Overlaps an existing booking.");
    assert.ok(seen.inserted);
    assert.equal(seen.skipOwnerNotify, true);
    assert.equal(seen.ownerMails, 0);
  }
});

function et(year: number, month: number, day: number, hour: number, minute: number) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

async function book(
  source: OverrideBookingSource,
  options: { jobs: { start: Date; end: Date }[]; date?: string; time?: string; notes?: string },
) {
  const previousKey = process.env.RESEND_API_KEY;
  const previousNotify = process.env.BOOKING_NOTIFY_EMAIL;
  process.env.RESEND_API_KEY = "re_test";
  process.env.BOOKING_NOTIFY_EMAIL = "billy@billyhere.com";
  const recipients: string[] = [];
  let skipOwnerNotify = false;
  let summary = "";
  let description = "";
  let ownerMails = 0;
  const saved: { row: Parameters<OverrideBookingDeps["insertBooking"]>[0] | null } = { row: null };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { to?: string[]; subject?: string };
    for (const to of body.to ?? []) recipients.push(to);
    if ((body.subject ?? "").startsWith("New shoot")) ownerMails += 1;
    return new Response(JSON.stringify({ id: "email_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const integrations = defaultBookingIntegrationDeps();
  const deps: OverrideBookingDeps = {
    listClients: async () => [client()],
    listConfirmedIntervals: async () => options.jobs,
    insertBooking: async (row) => {
      saved.row = row;
      return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    },
    calendarOn: () => true,
    async settle(input) {
      skipOwnerNotify = Boolean(input.skipOwnerNotify);
      summary = input.calendarWrite?.summary ?? "";
      description = input.calendarWrite?.description ?? "";
      return settleBookingIntegrations(input, {
        ...integrations,
        async writeCalendar() {
          return { status: "written", eventId: "evt_override" };
        },
        async sendSyncIssue() {
          throw new Error("sync alert should not send when mail and calendar succeed");
        },
        async saveBookingSync() {},
      });
    },
  };

  try {
    const result = await createOverrideBooking(
      {
        source,
        client: "BK00004",
        address: "12 Wood View Drive, Princeton, NJ",
        services: ["Real Estate · Photography"],
        date: options.date ?? "2026-09-22",
        time: options.time ?? "7:40",
        notes: options.notes === undefined ? "Lockbox 2222. pat@example.com" : options.notes,
      },
      deps,
    );
    return { result, inserted: saved.row, skipOwnerNotify, recipients, ownerMails, summary, description };
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousNotify == null) delete process.env.BOOKING_NOTIFY_EMAIL;
    else process.env.BOOKING_NOTIFY_EMAIL = previousNotify;
  }
}
