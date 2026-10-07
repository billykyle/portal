import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultBookingIntegrationDeps, settleBookingIntegrations } from "./booking-integrations";
import {
  createOverrideBooking,
  createQueuedBooking,
  resolveBookingClient,
  type BookingClientRecord,
  type OverrideBookingDeps,
  type OverrideBookingSource,
} from "./admin-book";
import { COMMERCIAL_VIDEO_HOURS_ERROR } from "./services";
import { TWILIGHT_ALONE_ERROR, TWILIGHT_DAY_TAKEN, twilightSlotForCalendarDate } from "./twilight";
import { DEFAULT_TIMEZONE } from "./rules";
import { formatBookingDuration } from "./slots";
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

test("exterior only occupies 15 minutes and titles the calendar Ext", async () => {
  const seen: {
    start: Date | null;
    end: Date | null;
    summary: string;
    description: string;
    emailStart: Date | null;
    emailEnd: Date | null;
  } = {
    start: null,
    end: null,
    summary: "",
    description: "",
    emailStart: null,
    emailEnd: null,
  };
  const booked = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Exterior Only"],
      date: "2026-09-23",
      time: "10:00am",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [],
      insertBooking: async (row) => {
        seen.start = row.startsAt;
        seen.end = row.endsAt;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      settle: async (input) => {
        seen.summary = input.calendarWrite?.summary ?? "";
        seen.description = input.calendarWrite?.description ?? "";
        seen.emailStart = input.email.start;
        seen.emailEnd = input.email.end;
        return {
          issues: { calendar: false, email: false, alertFailed: false },
          calendarEventId: "evt_ext",
          billyNotified: false,
          alertSent: false,
        };
      },
      calendarOn: () => true,
    },
  );
  assert.equal(booked.ok, true);
  assert.ok(seen.start && seen.end && seen.emailStart && seen.emailEnd);
  assert.equal(seen.end.getTime() - seen.start.getTime(), 15 * 60 * 1000);
  assert.equal(seen.emailEnd.getTime() - seen.emailStart.getTime(), 15 * 60 * 1000);
  assert.equal(formatBookingDuration(seen.emailStart, seen.emailEnd), "15 minutes");
  assert.equal(seen.summary, "Sam Lepore - Ext");
  assert.match(seen.description, /Services: Real Estate · Exterior Only/);

  const withPhotos = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography", "Real Estate · Exterior Only"],
      date: "2026-09-23",
      time: "10:00am",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [],
      insertBooking: async (row) => {
        seen.start = row.startsAt;
        seen.end = row.endsAt;
        return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      },
      settle: async (input) => {
        seen.summary = input.calendarWrite?.summary ?? "";
        return {
          issues: { calendar: false, email: false, alertFailed: false },
          calendarEventId: null,
          billyNotified: false,
          alertSent: false,
        };
      },
      calendarOn: () => true,
    },
  );
  assert.equal(withPhotos.ok, true);
  assert.equal(seen.end && seen.start ? seen.end.getTime() - seen.start.getTime() : 0, 60 * 60 * 1000);
  assert.equal(seen.summary, "Sam Lepore - P Ext");
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

test("create queued booking stores no start, skips calendar, and emails the client", async () => {
  const inserted: {
    row: {
      services: readonly string[];
      commercialVideoHours: number | null;
      notes: string | null;
      status: "queued";
      startsAt: null;
      endsAt: null;
      calendarEventId: null;
    } | null;
  } = { row: null };
  const hold: { address?: string; notes?: string | null; firstName?: string | null } = {};
  const booked = await createQueuedBooking(
    {
      source: "agent",
      client: "Sam Lepore",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Commercial video"],
      commercialHours: 4,
      notes: "Copy alex@agency.com",
    },
    {
      listClients: async () => [client()],
      insertQueuedBooking: async (row) => {
        inserted.row = row;
        return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      },
      sendHold: async (input) => {
        hold.address = input.address;
        hold.notes = input.notes;
        hold.firstName = input.firstName;
        assert.equal(input.clientEmail, "sam@example.com");
        assert.deepEqual(input.loginEmails, ["sam.login@example.com"]);
        return { clientSent: true };
      },
      saveEmailIssue: async (_id, emailFailed) => {
        assert.equal(emailFailed, false);
      },
    },
  );
  assert.equal(booked.ok, true);
  if (!booked.ok) return;
  assert.equal(booked.status, "queued");
  assert.equal(booked.startsAt, null);
  assert.equal(booked.endsAt, null);
  assert.equal(booked.calendar, "skipped");
  assert.equal(booked.email, "sent");
  assert.equal(booked.commercialVideoHours, 4);
  assert.equal(inserted.row?.commercialVideoHours, 4);
  assert.deepEqual(inserted.row?.services, ["Commercial video"]);
  assert.equal(inserted.row?.notes, "Copy alex@agency.com");
  assert.equal(inserted.row?.status, "queued");
  assert.equal(inserted.row?.startsAt, null);
  assert.equal(inserted.row?.endsAt, null);
  assert.equal(inserted.row?.calendarEventId, null);
  assert.equal(hold.address, "12 Wood View Drive, Princeton, NJ");
  assert.equal(hold.firstName, null);
});

test("create queued booking refuses a missing commercial length and an unknown client", async () => {
  const missing = await createQueuedBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Commercial video"],
    },
    {
      listClients: async () => [client()],
      insertQueuedBooking: async () => {
        throw new Error("should not insert");
      },
      sendHold: async () => {
        throw new Error("should not email");
      },
      saveEmailIssue: async () => {
        throw new Error("should not save");
      },
    },
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, COMMERCIAL_VIDEO_HOURS_ERROR);

  const unknown = await createQueuedBooking(
    {
      source: "agent",
      client: "Nobody",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography"],
    },
    {
      listClients: async () => [client()],
      insertQueuedBooking: async () => {
        throw new Error("should not insert");
      },
      sendHold: async () => {
        throw new Error("should not email");
      },
      saveEmailIssue: async () => {
        throw new Error("should not save");
      },
    },
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error, /No client matched/);
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
    assert.deepEqual(seen.result.ok && seen.result.warnings, []);
    assert.equal(seen.result.ok && seen.result.startEt, "Tue, Sep 22 at 7:40 PM");
    assert.equal(seen.skipOwnerNotify, true);
    assert.equal(seen.ownerMails, 0);
    assert.ok(seen.recipients.includes("sam.login@example.com"));
    assert.ok(seen.recipients.includes("pat@example.com"));
    assert.equal(seen.recipients.includes("billy@billyhere.com"), false);
    assert.equal(seen.summary, "Sam Lepore - P");
    assert.match(seen.description, /Notes: Lockbox 2222\. pat@example\.com/);
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
    assert.deepEqual(seen.result.ok && seen.result.warnings, ["Overlaps an existing booking."]);
    assert.ok(seen.inserted);
    assert.equal(seen.skipOwnerNotify, true);
    assert.equal(seen.ownerMails, 0);
  }
});

test("admin and agent bookings attach to the primary contact, not the newest login", async () => {
  const colleenId = "44444444-4444-4444-8444-444444444444";
  const nanaId = "55555555-5555-4555-8555-555555555555";
  const team = client({
    displayName: "Colleen Hadden",
    inviteCode: "BK00016",
    primaryEmail: "Colleen.Hadden@compass.com",
    logins: [
      {
        userId: nanaId,
        email: "nana.shames@compass.com",
        firstName: "Nana",
        lastName: "Shames",
        phone: "609-555-0199",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      {
        userId: "66666666-6666-4666-8666-666666666666",
        email: "assistant@compass.com",
        firstName: "Alex",
        lastName: "Assistant",
        phone: "609-555-0100",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        userId: colleenId,
        email: "colleen.hadden@compass.com",
        firstName: "Colleen",
        lastName: "Hadden",
        phone: "609-555-0101",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ],
  });

  let createdByUserId: string | null = "unset";
  let summary = "";
  let description = "";
  let mailed: { clientEmail?: string; loginEmails?: ReadonlyArray<string | null | undefined> | null } = {};
  const booked = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00016",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography"],
      date: "2026-09-22",
      time: "10:00am",
      notes: "cc alex@agency.com",
    },
    {
      listClients: async () => [team],
      listConfirmedIntervals: async () => [],
      insertBooking: async (row) => {
        createdByUserId = row.createdByUserId;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      settle: async (input) => {
        summary = input.calendarWrite?.summary ?? "";
        description = input.calendarWrite?.description ?? "";
        mailed = { clientEmail: input.email.clientEmail, loginEmails: input.email.loginEmails };
        return {
          issues: { calendar: false, email: false, alertFailed: false },
          calendarEventId: "evt_primary",
          billyNotified: false,
          alertSent: false,
        };
      },
      calendarOn: () => true,
    },
  );
  assert.equal(booked.ok, true);
  assert.equal(createdByUserId, colleenId);
  assert.equal(summary, "Colleen Hadden - P");
  assert.match(description, /Email: colleen\.hadden@compass\.com/);
  assert.match(description, /Phone: 609-555-0101/);
  assert.doesNotMatch(description, /Nana Shames|609-555-0199|nana\.shames/);
  assert.equal(mailed.clientEmail, "colleen.hadden@compass.com");
  assert.deepEqual(mailed.loginEmails, [
    "nana.shames@compass.com",
    "assistant@compass.com",
    "colleen.hadden@compass.com",
  ]);

  let queuedBy: string | null = "unset";
  let queuedMail: { clientEmail?: string; firstName?: string | null } = {};
  const queued = await createQueuedBooking(
    {
      source: "admin-ui",
      client: "BK00016",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography"],
    },
    {
      listClients: async () => [team],
      insertQueuedBooking: async (row) => {
        queuedBy = row.createdByUserId;
        return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      },
      sendHold: async (input) => {
        queuedMail = { clientEmail: input.clientEmail, firstName: input.firstName };
        return { clientSent: true };
      },
      saveEmailIssue: async () => {},
    },
  );
  assert.equal(queued.ok, true);
  assert.equal(queuedBy, colleenId);
  assert.equal(queuedMail.clientEmail, "colleen.hadden@compass.com");
  assert.equal(queuedMail.firstName, "Colleen");
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

test("twilight defaults to sunset, accepts any time, and warns instead of rejecting a second one", async () => {
  const sunset = twilightSlotForCalendarDate({ year: 2026, month: 6, day: 24 });
  assert.ok(sunset);
  const seen: { start: Date | null; end: Date | null; summary: string; twilightDay: string | null } = {
    start: null,
    end: null,
    summary: "",
    twilightDay: null,
  };
  const deps: OverrideBookingDeps = {
    listClients: async () => [client()],
    listConfirmedIntervals: async () => [],
    insertBooking: async (row) => {
      seen.start = row.startsAt;
      seen.end = row.endsAt;
      seen.twilightDay = row.twilightDay;
      return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    },
    settle: async (input: { calendarWrite?: { summary: string } }) => {
      seen.summary = input.calendarWrite?.summary ?? "";
      return {
        issues: { calendar: false, email: false, alertFailed: false },
        calendarEventId: "evt_twi",
        billyNotified: false,
        alertSent: false,
      };
    },
    calendarOn: () => true,
    twilightDayTaken: async () => false,
  };

  for (const source of ["agent", "admin-ui"] as const) {
    const omitted = await createOverrideBooking(
      {
        source,
        client: "BK00004",
        address: "12 Wood View Drive, Princeton, NJ",
        services: ["Real Estate · Twilight"],
        date: "2026-06-24",
        time: "",
      },
      deps,
    );
    assert.equal(omitted.ok, true);
    assert.equal(seen.start?.toISOString(), sunset.start.toISOString());
    assert.equal(seen.end?.getTime(), sunset.end.getTime());
    assert.equal(seen.end && seen.start ? seen.end.getTime() - seen.start.getTime() : 0, 30 * 60 * 1000);
    assert.equal(seen.summary, "Sam Lepore - Twilight");
    assert.equal(seen.twilightDay, "2026-06-24");
    assert.deepEqual(omitted.ok && omitted.warnings, []);
  }

  const override = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Twilight"],
      date: "2026-06-24",
      time: "4:00pm",
    },
    deps,
  );
  assert.equal(override.ok, true);
  assert.equal(
    seen.start?.toISOString(),
    zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year: 2026, month: 6, day: 24, hour: 16, minute: 0 }).toISOString(),
  );
  assert.equal(seen.end && seen.start ? seen.end.getTime() - seen.start.getTime() : 0, 30 * 60 * 1000);
  assert.equal(seen.twilightDay, "2026-06-24");

  const taken = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Twilight"],
      date: "2026-06-24",
      time: "4:15pm",
    },
    { ...deps, twilightDayTaken: async () => true },
  );
  assert.equal(taken.ok, true);
  if (taken.ok) {
    assert.equal(taken.overlapWarning, null);
    assert.deepEqual(taken.warnings, [TWILIGHT_DAY_TAKEN]);
  }
  assert.equal(seen.twilightDay, null);
  assert.equal(seen.summary, "Sam Lepore - Twilight");

  let raceCalls = 0;
  const raced = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Twilight"],
      date: "2026-06-25",
      time: "8:30pm",
    },
    {
      ...deps,
      twilightDayTaken: async () => false,
      insertBooking: async (row) => {
        raceCalls += 1;
        if (raceCalls === 1) {
          const error = new Error(
            'duplicate key value violates unique constraint "bookings_one_twilight_per_day"',
          ) as Error & { code: string };
          error.code = "23505";
          throw error;
        }
        seen.twilightDay = row.twilightDay;
        seen.start = row.startsAt;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
    },
  );
  assert.equal(raced.ok, true);
  assert.equal(raceCalls, 2);
  assert.equal(seen.twilightDay, null);
  if (raced.ok) assert.deepEqual(raced.warnings, [TWILIGHT_DAY_TAKEN]);

  const mixed = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Twilight", "Real Estate · Photography"],
      date: "2026-06-24",
      time: "4:00pm",
    },
    deps,
  );
  assert.equal(mixed.ok, true);
  assert.equal(seen.end && seen.start ? seen.end.getTime() - seen.start.getTime() : 0, 75 * 60 * 1000);
  assert.equal(seen.twilightDay, "2026-06-24");
  assert.equal(seen.summary, "Sam Lepore - P Twilight");

  const mixedSunset = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography", "Real Estate · Twilight"],
      date: "2026-06-24",
      time: "",
    },
    deps,
  );
  assert.equal(mixedSunset.ok, true);
  assert.equal(seen.start?.toISOString(), sunset.start.toISOString());
  assert.equal(seen.end && seen.start ? seen.end.getTime() - seen.start.getTime() : 0, 75 * 60 * 1000);
});

test("override booking still rejects a missing client, a bad date, an unknown service, and a missing time", async () => {
  const deps: OverrideBookingDeps = {
    listClients: async () => [client()],
    listConfirmedIntervals: async () => [],
    insertBooking: async () => {
      throw new Error("should not insert");
    },
    settle: async () => {
      throw new Error("should not settle");
    },
    calendarOn: () => false,
  };
  const missingClient = await createOverrideBooking(
    {
      source: "agent",
      client: "",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography"],
      date: "2026-09-22",
      time: "10am",
    },
    deps,
  );
  assert.equal(missingClient.ok, false);
  if (!missingClient.ok) assert.equal(missingClient.error, "Choose a client.");

  const badDate = await createOverrideBooking(
    {
      source: "admin-ui",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Photography"],
      date: "09/22/2026",
      time: "10am",
    },
    deps,
  );
  assert.equal(badDate.ok, false);
  if (!badDate.ok) assert.equal(badDate.error, "Enter a date as YYYY-MM-DD.");

  const unknown = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Headshots"],
      date: "2026-09-22",
      time: "10am",
    },
    deps,
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.match(unknown.error, /Unknown service "Headshots"/);

  const noTime = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Podcast · 1 episode"],
      date: "2026-09-20",
      time: "",
    },
    deps,
  );
  assert.equal(noTime.ok, false);
  if (!noTime.ok) assert.equal(noTime.error, "Enter a time.");
});

test("override booking ignores category, the slot grid, Sunday, and a second Twilight overlapping another shoot", async () => {
  const seen: { services: string[]; twilightDay: string | null; start: Date | null; end: Date | null } = {
    services: [],
    twilightDay: null,
    start: null,
    end: null,
  };
  const booked = await createOverrideBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Podcast · 1 episode", "Real Estate · Twilight"],
      date: "2026-09-20",
      time: "7:07pm",
    },
    {
      listClients: async () => [client()],
      listConfirmedIntervals: async () => [{ start: et(2026, 9, 20, 19, 0), end: et(2026, 9, 20, 20, 0) }],
      insertBooking: async (row) => {
        seen.services = [...row.services];
        seen.twilightDay = row.twilightDay;
        seen.start = row.startsAt;
        seen.end = row.endsAt;
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      settle: async () => ({
        issues: { calendar: false, email: false, alertFailed: false },
        calendarEventId: "evt_mix",
        billyNotified: false,
        alertSent: false,
      }),
      calendarOn: () => true,
      twilightDayTaken: async () => true,
    },
  );
  assert.equal(booked.ok, true);
  if (!booked.ok) return;
  assert.deepEqual(seen.services, ["Real Estate · Twilight", "Podcast · 1 episode"]);
  assert.equal(seen.twilightDay, null);
  const parts = utcToZonedParts(seen.start!, DEFAULT_TIMEZONE);
  assert.equal(parts.day, 20);
  assert.equal(parts.hour, 19);
  assert.equal(parts.minute, 7);
  assert.equal(seen.end!.getTime() - seen.start!.getTime(), (60 + 30) * 60 * 1000);
  assert.equal(booked.overlapWarning, "Overlaps an existing booking.");
  assert.deepEqual(booked.warnings, ["Overlaps an existing booking.", TWILIGHT_DAY_TAKEN]);
  assert.equal(booked.calendar, "written");

  const source = readFileSync(new URL("./admin-book.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function createOverrideBooking");
  const end = source.indexOf("export type QueuedBookingInput");
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /clientCategoryServiceError|offerSlotsForAddress|loadLiveAvailabilitySources/);
  assert.doesNotMatch(body, /twilightAloneError/);
});

test("a queued shoot still cannot combine Twilight with other services", async () => {
  const mixed = await createQueuedBooking(
    {
      source: "agent",
      client: "BK00004",
      address: "12 Wood View Drive, Princeton, NJ",
      services: ["Real Estate · Twilight", "Real Estate · Photography"],
    },
    {
      listClients: async () => [client()],
      insertQueuedBooking: async () => {
        throw new Error("should not insert");
      },
      sendHold: async () => {
        throw new Error("should not email");
      },
      saveEmailIssue: async () => {
        throw new Error("should not save");
      },
    },
  );
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.equal(mixed.error, TWILIGHT_ALONE_ERROR);
});
