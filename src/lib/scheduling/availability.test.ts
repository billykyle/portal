import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShootAddress, sameAddress } from "./address";
import { keepRetainedStarts, offerSlotsForAddress, publicCalendarError, withoutOwnBooking } from "./availability";
import { schedulingIntegrations } from "./config";
import { mergeIntervals, overlaps, subtractInterval } from "./intervals";
import { DEFAULT_TIMEZONE, TRAVEL_PAD_MINUTES } from "./rules";
import { generateCandidateSlots } from "./slots";
import { pickNextJob, pickNextJobs, pickPriorJob, travelFits } from "./travel";
import { calendarDateKey, utcToZonedParts, zonedDateTimeToUtc } from "./zoned-time";

const PHILLY = "1500 Market Street, Philadelphia, PA";
const SHORE = "100 1st Avenue, Avalon, NJ";
const LANSDALE = "112 Lenape Dr, Lansdale, PA 19446";
const CHERRY_HILL = "1950 Route 70 East, Suite 300, Cherry Hill, NJ";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("address-first rejects empty and incomplete addresses", () => {
  assert.equal(parseShootAddress("").ok, false);
  assert.equal(parseShootAddress("   ").ok, false);
  assert.equal(parseShootAddress("Main Street").ok, false);
  assert.equal(parseShootAddress("12").ok, false);
  const ok = parseShootAddress("  12 Wood View Drive  ");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.address, "12 Wood View Drive");
});

test("Philly noon + Shore 1pm is refused when drive time is real", () => {
  const prior = { start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13), address: PHILLY };
  const slot = { start: et(2026, 9, 21, 13), end: et(2026, 9, 21, 14, 30) };
  const driveMinutes = 90;
  const verdict = travelFits({
    slot,
    newAddress: SHORE,
    prior,
    next: null,
    driveSeconds: () => driveMinutes * 60,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.match(verdict.reason, /Travel from the prior job does not fit/);
  }
});

test("a Shore slot that fits live drive time with no pad is offered", () => {
  const prior = { start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13), address: PHILLY };
  const slot = { start: et(2026, 9, 21, 14, 30), end: et(2026, 9, 21, 16) };
  const verdict = travelFits({
    slot,
    newAddress: SHORE,
    prior,
    next: null,
    driveSeconds: () => 90 * 60,
  });
  assert.equal(verdict.ok, true);
  if (verdict.ok) assert.equal(verdict.driveSecondsFromPrior, 90 * 60);
});

test("a later Shore slot is offered when live drive time fits", () => {
  const prior = { start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13), address: PHILLY };
  const slot = { start: et(2026, 9, 21, 15), end: et(2026, 9, 21, 16, 30) };
  const verdict = travelFits({
    slot,
    newAddress: SHORE,
    prior,
    next: null,
    driveSeconds: () => 90 * 60,
  });
  assert.equal(verdict.ok, true);
  if (verdict.ok) assert.equal(verdict.driveSecondsFromPrior, 90 * 60);
});

test("unknown drive time refuses the slot instead of guessing geography", () => {
  const prior = { start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13), address: PHILLY };
  const slot = { start: et(2026, 9, 21, 17), end: et(2026, 9, 21, 18, 30) };
  const verdict = travelFits({
    slot,
    newAddress: SHORE,
    prior,
    next: null,
    driveSeconds: () => null,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /could not be measured/);
});

test("same-address jobs can start when the prior job ends", () => {
  const prior = { start: et(2026, 9, 21, 9), end: et(2026, 9, 21, 10, 30), address: PHILLY };
  const abutting = travelFits({
    slot: { start: et(2026, 9, 21, 10, 30), end: et(2026, 9, 21, 12) },
    newAddress: PHILLY,
    prior,
    next: null,
    driveSeconds: () => {
      throw new Error("should not measure same-address travel");
    },
  });
  assert.equal(abutting.ok, true);

  const gap = travelFits({
    slot: { start: et(2026, 9, 21, 10, 40), end: et(2026, 9, 21, 12, 10) },
    newAddress: PHILLY,
    prior,
    next: null,
    driveSeconds: () => {
      throw new Error("should not measure same-address travel");
    },
  });
  assert.equal(gap.ok, true);
});

test("offerSlotsForAddress never returns times without a valid address", async () => {
  const result = await offerSlotsForAddress("", {
    now: et(2026, 9, 19, 9),
    busy: [],
    jobs: [],
    calendarConfigured: false,
    driveTimeConfigured: false,
    driveSeconds: async () => null,
  });
  assert.equal(result.slots.length, 0);
  assert.equal(result.error, "Enter the shoot address first.");
});

test("engine hides Lansdale 11:15–12:00 when Cherry Hill starts at noon", async () => {
  const now = et(2026, 9, 20, 9);
  const cherryHill = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: CHERRY_HILL,
  };
  const arena = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: null,
  };
  const result = await offerSlotsForAddress(
    LANSDALE,
    {
      now,
      busy: [{ start: cherryHill.start, end: cherryHill.end }],
      jobs: [arena, cherryHill],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 50 * 60,
    },
    ["Real Estate · Photography"],
  );
  const elevenFifteen = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 24, 11, 15).getTime());
  assert.equal(elevenFifteen, undefined);
  const ten = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 24, 10).getTime());
  assert.ok(ten);
});

test("engine offers a noon-abutting slot when the next busy block has no location", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(
    LANSDALE,
    {
      now,
      busy: [{ start: et(2026, 9, 24, 12), end: et(2026, 9, 24, 13, 30) }],
      jobs: [],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => {
        throw new Error("should not measure travel without a location");
      },
    },
    ["Real Estate · Photography"],
  );
  const elevenFifteen = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 24, 11, 15).getTime());
  assert.ok(elevenFifteen);
});

test("engine hides Shore 1pm after a Philly noon job", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(SHORE, {
    now,
    busy: [{ start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13) }],
    jobs: [{ start: et(2026, 9, 21, 12), end: et(2026, 9, 21, 13), address: PHILLY }],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => 90 * 60,
  });
  const onePm = result.slots.find((slot) => {
    const start = new Date(slot.start);
    return start.getTime() === et(2026, 9, 21, 13).getTime();
  });
  assert.equal(onePm, undefined);
  const threePm = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 15).getTime());
  assert.ok(threePm);
});

test("candidate slots are 9:00–18:00 starts on 15-minute steps in America/New_York", () => {
  const slots = generateCandidateSlots({
    now: et(2026, 9, 20, 6),
    timeZone: DEFAULT_TIMEZONE,
    openHour: 9,
    closeHour: 18,
    slotMinutes: 90,
    stepMinutes: 15,
    daysAhead: 2,
    minLeadMinutes: 0,
  });
  assert.ok(slots.length > 0);
  assert.equal(slots[0].start.getTime(), et(2026, 9, 21, 9).getTime());
  assert.equal(slots[1].start.getTime(), et(2026, 9, 21, 9, 15).getTime());
  const last = slots[slots.length - 1];
  assert.equal(last.start.getTime(), et(2026, 9, 21, 18).getTime());
  assert.equal(last.end.getTime(), et(2026, 9, 21, 19, 30).getTime());
});

test("a 6:00pm start is offered even when the job end runs past close", () => {
  const slots = generateCandidateSlots({
    now: et(2026, 9, 20, 6),
    timeZone: DEFAULT_TIMEZONE,
    openHour: 9,
    closeHour: 18,
    slotMinutes: 15,
    stepMinutes: 15,
    daysAhead: 2,
    minLeadMinutes: 0,
  });
  assert.equal(slots[0].end.getTime() - slots[0].start.getTime(), 15 * 60 * 1000);
  const last = slots[slots.length - 1];
  assert.equal(last.start.getTime(), et(2026, 9, 21, 18).getTime());
  assert.equal(last.end.getTime(), et(2026, 9, 21, 18, 15).getTime());
});

test("zoned noon Eastern is 16:00 UTC in September", () => {
  assert.equal(et(2026, 9, 21, 12).toISOString(), "2026-09-21T16:00:00.000Z");
});

test("busy intervals merge and overlap", () => {
  const merged = mergeIntervals([
    { start: et(2026, 9, 21, 9), end: et(2026, 9, 21, 10) },
    { start: et(2026, 9, 21, 9, 30), end: et(2026, 9, 21, 11) },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].end.getTime(), et(2026, 9, 21, 11).getTime());
  assert.equal(
    overlaps({ start: et(2026, 9, 21, 10), end: et(2026, 9, 21, 11) }, { start: et(2026, 9, 21, 10, 30), end: et(2026, 9, 21, 12) }),
    true,
  );
});

test("prior job is the latest job that ends before the slot", () => {
  const prior = pickPriorJob(
    [
      { start: et(2026, 9, 21, 8), end: et(2026, 9, 21, 9, 30), address: PHILLY },
      { start: et(2026, 9, 21, 10), end: et(2026, 9, 21, 11, 30), address: SHORE },
    ],
    et(2026, 9, 21, 13),
  );
  assert.equal(prior?.address, SHORE);
});

test("next job at an exclusive end prefers the located event", () => {
  const slotEnd = et(2026, 9, 24, 12);
  const arena = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: null,
  };
  const cherryHill = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: CHERRY_HILL,
  };
  const nexts = pickNextJobs([arena, cherryHill], slotEnd);
  assert.equal(nexts.length, 2);
  assert.equal(pickNextJob([arena, cherryHill], slotEnd)?.address, CHERRY_HILL);
});

test("Lansdale 11:15–12:00 is refused when Cherry Hill starts at noon", () => {
  const slot = { start: et(2026, 9, 24, 11, 15), end: et(2026, 9, 24, 12) };
  const next = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: CHERRY_HILL,
  };
  const verdict = travelFits({
    slot,
    newAddress: LANSDALE,
    prior: null,
    next,
    driveSeconds: () => 50 * 60,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /Travel to the next job does not fit/);
});

test("a no-location prior event allows a slot that starts when it ends", () => {
  const verdict = travelFits({
    slot: { start: et(2026, 9, 24, 12), end: et(2026, 9, 24, 12, 45) },
    newAddress: LANSDALE,
    prior: { start: et(2026, 9, 24, 10, 30), end: et(2026, 9, 24, 12), address: null },
    next: null,
    driveSeconds: () => {
      throw new Error("should not measure travel without a location");
    },
  });
  assert.equal(verdict.ok, true);
});

test("a no-location noon event allows a slot that ends at noon", () => {
  const slot = { start: et(2026, 9, 24, 11, 15), end: et(2026, 9, 24, 12) };
  const verdict = travelFits({
    slot,
    newAddress: LANSDALE,
    prior: null,
    next: { start: et(2026, 9, 24, 12), end: et(2026, 9, 24, 13, 30), address: null },
    driveSeconds: () => {
      throw new Error("should not measure travel without a location");
    },
  });
  assert.equal(verdict.ok, true);
});

test("overlapping no-location event cannot hide a Cherry Hill travel check", () => {
  const slot = { start: et(2026, 9, 24, 11, 15), end: et(2026, 9, 24, 12) };
  const arena = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: null,
  };
  const cherryHill = {
    start: et(2026, 9, 24, 12),
    end: et(2026, 9, 24, 13, 30),
    address: CHERRY_HILL,
  };
  const verdict = travelFits({
    slot,
    newAddress: LANSDALE,
    prior: null,
    next: [arena, cherryHill],
    driveSeconds: () => 50 * 60,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.reason, /Travel to the next job does not fit/);
});

test("a slot is busy if either availability calendar is busy", async () => {
  const now = et(2026, 9, 20, 9);
  const workBusy = { start: et(2026, 9, 21, 9), end: et(2026, 9, 21, 10) };
  const personalBusy = { start: et(2026, 9, 21, 14), end: et(2026, 9, 21, 15) };
  const result = await offerSlotsForAddress(PHILLY, {
    now,
    busy: [workBusy, personalBusy],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  });
  const nine = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 9).getTime());
  const two = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 14).getTime());
  const eleven = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 11).getTime());
  assert.equal(nine, undefined);
  assert.equal(two, undefined);
  assert.ok(eleven);
});

test("sameAddress ignores punctuation and country suffix", () => {
  assert.equal(sameAddress("1500 Market St., Philadelphia, PA, USA", "1500 Market St, Philadelphia, PA"), true);
});

test("env hooks stay off when Calendar/Maps credentials are missing", () => {
  const previous = {
    GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GCP_SERVICE_ACCOUNT_EMAIL: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    GCP_PROJECT_NUMBER: process.env.GCP_PROJECT_NUMBER,
    GCP_WORKLOAD_IDENTITY_POOL_ID: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID,
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  };
  delete process.env.GOOGLE_CALENDAR_IDS;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.GOOGLE_CLIENT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GCP_PROJECT_NUMBER;
  delete process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  delete process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const integrations = schedulingIntegrations();
  assert.equal(integrations.calendarConfigured, false);
  assert.equal(integrations.driveTimeConfigured, false);
  assert.equal(integrations.placesConfigured, false);
  restoreEnv(previous);
});

test("travel pad is locked at 0 minutes", () => {
  assert.equal(TRAVEL_PAD_MINUTES, 0);
});

test("offered slots carry a date key and a 3-month bookable window", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(PHILLY, {
    now,
    busy: [],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  });
  assert.equal(result.firstBookableDate, "2026-09-20");
  assert.equal(result.lastBookableDate, "2026-12-20");
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-09-20"),
    false,
  );
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-21"));
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-12-18"));
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-12-20"),
    false,
  );
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-12-21"),
    false,
  );
});

test("offered slots use the summed service duration instead of 90 minutes", async () => {
  const now = et(2026, 9, 20, 9);
  const sources = {
    now,
    busy: [],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  };
  const zillow = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Zillow 360"]);
  const zillowSlot = zillow.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 10).getTime());
  assert.ok(zillowSlot);
  assert.equal(startMs(zillowSlot.end), et(2026, 9, 21, 10, 15).getTime());

  const aerial = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Aerial Photos"]);
  const aerialSlot = aerial.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 10).getTime());
  assert.ok(aerialSlot);
  assert.equal(startMs(aerialSlot.end), et(2026, 9, 21, 10, 15).getTime());

  const combo = await offerSlotsForAddress(PHILLY, sources, [
    "Real Estate · Photography",
    "Real Estate · Video",
  ]);
  const comboSlot = combo.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 10).getTime());
  assert.ok(comboSlot);
  assert.equal(startMs(comboSlot.end), et(2026, 9, 21, 11, 15).getTime());

  const podcast = await offerSlotsForAddress(PHILLY, sources, ["Podcast · 2 episodes"]);
  const podcastSlot = podcast.slots.find((slot) => startMs(slot.start) === et(2026, 9, 21, 10).getTime());
  assert.ok(podcastSlot);
  assert.equal(startMs(podcastSlot.end), et(2026, 9, 21, 11, 45).getTime());
});

test("modifying a booking does not let its own window block the same slot", async () => {
  const now = et(2026, 9, 20, 9);
  const own = { start: et(2026, 9, 25, 14), end: et(2026, 9, 25, 15) };
  const neighbor = {
    start: et(2026, 9, 25, 16),
    end: et(2026, 9, 25, 17),
    address: SHORE,
  };
  const sources = withoutOwnBooking(
    {
      now,
      busy: [own, { start: neighbor.start, end: neighbor.end }],
      jobs: [{ ...own, address: PHILLY }, neighbor],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 20 * 60,
    },
    own,
  );
  assert.equal(
    sources.busy.some((block) => block.start.getTime() === own.start.getTime() && block.end.getTime() === own.end.getTime()),
    false,
  );
  assert.equal(
    sources.jobs.some((job) => job.start.getTime() === own.start.getTime() && job.end.getTime() === own.end.getTime()),
    false,
  );

  const result = await offerSlotsForAddress(PHILLY, sources, ["Podcast · 1 episode"], {
    retainStarts: [own.start],
  });
  const kept = result.slots.find((slot) => startMs(slot.start) === own.start.getTime());
  assert.ok(kept);
  assert.equal(startMs(kept.end), own.end.getTime());
});

test("modify keeps the original start when a longer duration overlaps another shoot", async () => {
  const now = et(2026, 9, 20, 9);
  const own = { start: et(2026, 9, 25, 14), end: et(2026, 9, 25, 15) };
  const nextShoot = {
    start: et(2026, 9, 25, 15),
    end: et(2026, 9, 25, 16),
    address: SHORE,
  };
  const sources = withoutOwnBooking(
    {
      now,
      busy: [own, { start: nextShoot.start, end: nextShoot.end }],
      jobs: [{ ...own, address: PHILLY, eventId: "evt-own" }, nextShoot],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 20 * 60,
    },
    own,
    { calendarEventId: "evt-own" },
  );
  assert.equal(
    sources.jobs.some((job) => job.eventId === "evt-own"),
    false,
  );

  const result = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Photography", "Real Estate · Video"], {
    retainStarts: [own.start],
  });
  const kept = result.slots.find((slot) => startMs(slot.start) === own.start.getTime());
  assert.ok(kept, "original start must stay offered on modify");
  assert.equal(startMs(kept.end), et(2026, 9, 25, 15, 15).getTime());
  const twoFifteen = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 25, 14, 15).getTime());
  assert.equal(twoFifteen, undefined);
});

test("keepRetainedStarts inserts a missing original start without dropping other slots", () => {
  const existing = [
    {
      start: "2026-09-25T15:00:00.000Z",
      end: "2026-09-25T16:00:00.000Z",
      dateKey: "2026-09-25",
      dateLabel: "Friday, Sep 25",
      timeLabel: "11:00 AM – 12:00 PM",
      driveSecondsFromPrior: null,
      stackDriveSeconds: null,
    },
  ];
  const kept = keepRetainedStarts(existing, [et(2026, 9, 25, 10)], 45, DEFAULT_TIMEZONE);
  assert.equal(kept.length, 2);
  assert.equal(kept[0]?.start, et(2026, 9, 25, 10).toISOString());
  assert.equal(kept[1]?.start, existing[0]?.start);
});

test("same-day and Tue/Sat/Sun never offer new candidate slots", () => {
  const mondayMorning = generateCandidateSlots({
    now: et(2026, 9, 21, 8),
    timeZone: DEFAULT_TIMEZONE,
    openHour: 9,
    closeHour: 18,
    slotMinutes: 45,
    stepMinutes: 15,
    daysAhead: 8,
    minLeadMinutes: 0,
  });
  const dateKeys = new Set(
    mondayMorning.map((slot) => calendarDateKey(utcToZonedParts(slot.start, DEFAULT_TIMEZONE))),
  );
  assert.equal(dateKeys.has("2026-09-21"), false, "today (Monday) must have no new slots");
  assert.equal(dateKeys.has("2026-09-22"), false, "Tuesday");
  assert.equal(dateKeys.has("2026-09-26"), false, "Saturday");
  assert.equal(dateKeys.has("2026-09-27"), false, "Sunday");
  assert.ok(dateKeys.has("2026-09-23"), "Wednesday");
  assert.ok(dateKeys.has("2026-09-24"), "Thursday");
  assert.ok(dateKeys.has("2026-09-25"), "Friday");
  assert.ok(dateKeys.has("2026-09-28"), "next Monday");
});

test("blocked days stay empty except the retained modify start", () => {
  const retain = et(2026, 9, 22, 14);
  const slots = generateCandidateSlots({
    now: et(2026, 9, 21, 9),
    timeZone: DEFAULT_TIMEZONE,
    openHour: 9,
    closeHour: 18,
    slotMinutes: 45,
    stepMinutes: 15,
    daysAhead: 3,
    minLeadMinutes: 0,
    retainStarts: [retain],
  });
  const tuesday = slots.filter(
    (slot) => calendarDateKey(utcToZonedParts(slot.start, DEFAULT_TIMEZONE)) === "2026-09-22",
  );
  assert.equal(tuesday.length, 1);
  assert.equal(tuesday[0]?.start.getTime(), retain.getTime());
  assert.equal(
    slots.some((slot) => slot.start.getTime() === et(2026, 9, 22, 10).getTime()),
    false,
  );
});

test("engine offers no new times on today or a blocked weekday", async () => {
  const now = et(2026, 9, 21, 9);
  const result = await offerSlotsForAddress(PHILLY, {
    now,
    busy: [],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  });
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-09-21"),
    false,
  );
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-09-22"),
    false,
  );
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-23"));
  assert.equal(result.firstBookableDate, "2026-09-21");
});

test("modify keeps a same-day start and does not invent other today slots", async () => {
  const now = et(2026, 9, 21, 10);
  const own = { start: et(2026, 9, 21, 15), end: et(2026, 9, 21, 15, 45) };
  const result = await offerSlotsForAddress(
    PHILLY,
    {
      now,
      busy: [],
      jobs: [],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => null,
    },
    ["Real Estate · Photography"],
    { retainStarts: [own.start] },
  );
  const kept = result.slots.filter((slot) => slot.dateKey === "2026-09-21");
  assert.equal(kept.length, 1);
  assert.equal(startMs(kept[0]?.start ?? ""), own.start.getTime());
});

test("retainStarts keeps a booking inside the lead window when modifying", () => {
  const now = et(2026, 9, 21, 14);
  const retain = et(2026, 9, 21, 15);
  const slots = generateCandidateSlots({
    now,
    timeZone: DEFAULT_TIMEZONE,
    openHour: 9,
    closeHour: 18,
    slotMinutes: 60,
    stepMinutes: 15,
    daysAhead: 1,
    minLeadMinutes: 120,
    retainStarts: [retain],
  });
  assert.ok(slots.some((slot) => slot.start.getTime() === retain.getTime()));
  assert.equal(
    slots.some((slot) => slot.start.getTime() === et(2026, 9, 21, 14, 15).getTime()),
    false,
  );
});

test("withoutOwnBooking drops a calendar event by id even when its times differ", () => {
  const own = { start: et(2026, 9, 25, 14), end: et(2026, 9, 25, 15) };
  const calendarCopy = {
    start: et(2026, 9, 25, 14),
    end: et(2026, 9, 25, 15, 10),
    address: PHILLY,
    eventId: "evt-own",
  };
  const sources = withoutOwnBooking(
    {
      now: et(2026, 9, 20, 9),
      busy: [own, { start: calendarCopy.start, end: calendarCopy.end }],
      jobs: [calendarCopy],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => null,
    },
    own,
    { calendarEventId: "evt-own" },
  );
  assert.equal(sources.jobs.length, 0);
  assert.equal(sources.busy.length, 0);
});

test("subtractInterval punches only the booking window out of a merged busy block", () => {
  const own = { start: et(2026, 9, 25, 14), end: et(2026, 9, 25, 15) };
  const leftover = subtractInterval(
    [{ start: et(2026, 9, 25, 14), end: et(2026, 9, 25, 17) }],
    own,
  );
  assert.equal(leftover.length, 1);
  assert.equal(leftover[0]?.start.getTime(), et(2026, 9, 25, 15).getTime());
  assert.equal(leftover[0]?.end.getTime(), et(2026, 9, 25, 17).getTime());
});

test("suggestedDate prefers a stacked day over a sooner empty-area day", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10) }],
      jobs: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10), address: CHERRY_HILL }],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => {
        throw new Error("same-address stack should not call Maps");
      },
    },
    ["Real Estate · Aerial Photos"],
  );
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-21"), "sooner empty-area day still offered");
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-23"), "stacked day still offered");
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-25"), "later empty-area day still offered");
  assert.equal(result.suggestedDate, "2026-09-23");
  const wednesday = result.slots.filter((slot) => slot.dateKey === "2026-09-23");
  assert.ok(wednesday.some((slot) => slot.stackDriveSeconds === 0));
});

test("suggestedDate falls back to the soonest day with any slot when nothing stacks", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [],
      jobs: [
        { start: et(2026, 9, 21, 9), end: et(2026, 9, 21, 10), address: null },
        { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 10), address: SHORE },
      ],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 90 * 60,
    },
    ["Real Estate · Aerial Photos"],
  );
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-09-21" && slot.stackDriveSeconds == null),
    true,
  );
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-25" && slot.stackDriveSeconds === 90 * 60));
  assert.equal(result.suggestedDate, "2026-09-21");
});

test("blocked days stay empty even when a located job would stack there", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [{ start: et(2026, 9, 22, 9), end: et(2026, 9, 22, 10) }],
      jobs: [{ start: et(2026, 9, 22, 9), end: et(2026, 9, 22, 10), address: CHERRY_HILL }],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 10 * 60,
    },
    ["Real Estate · Aerial Photos"],
  );
  assert.equal(
    result.slots.some((slot) => slot.dateKey === "2026-09-22"),
    false,
  );
  assert.equal(result.suggestedDate, "2026-09-21");
});

test("modify keeps a weak-score start and does not invent blocked-day slots", async () => {
  const now = et(2026, 9, 21, 9);
  const own = { start: et(2026, 9, 22, 14), end: et(2026, 9, 22, 14, 15) };
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10) }],
      jobs: [
        { start: et(2026, 9, 22, 9), end: et(2026, 9, 22, 10), address: SHORE },
        { start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10), address: CHERRY_HILL },
      ],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async (from, to) => (from.includes("Avalon") || to.includes("Avalon") ? 90 * 60 : 10 * 60),
    },
    ["Real Estate · Aerial Photos"],
    { retainStarts: [own.start] },
  );
  const tuesday = result.slots.filter((slot) => slot.dateKey === "2026-09-22");
  assert.equal(tuesday.length, 1);
  assert.equal(startMs(tuesday[0]?.start ?? ""), own.start.getTime());
  assert.ok(tuesday[0]?.stackDriveSeconds == null || tuesday[0].stackDriveSeconds > 0);
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-23" && slot.stackDriveSeconds === 0));
});

test("sort puts nearer-route times first on a day when stack scores differ", async () => {
  const now = et(2026, 9, 20, 9);
  const near = "2000 Route 70 East, Cherry Hill, NJ";
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [
        { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 9, 30) },
        { start: et(2026, 9, 25, 12), end: et(2026, 9, 25, 12, 30) },
        { start: et(2026, 9, 25, 15), end: et(2026, 9, 25, 15, 30) },
      ],
      jobs: [
        { start: et(2026, 9, 25, 9), end: et(2026, 9, 25, 9, 30), address: PHILLY },
        { start: et(2026, 9, 25, 12), end: et(2026, 9, 25, 12, 30), address: PHILLY },
        { start: et(2026, 9, 25, 15), end: et(2026, 9, 25, 15, 30), address: near },
      ],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async (from, to) =>
        from.includes("Philadelphia") || to.includes("Philadelphia") ? 40 * 60 : 10 * 60,
    },
    ["Real Estate · Aerial Photos"],
  );
  const friday = result.slots.filter((slot) => slot.dateKey === "2026-09-25");
  assert.ok(friday.length >= 2);
  const scores = new Set(friday.map((slot) => slot.stackDriveSeconds));
  assert.ok(scores.has(40 * 60));
  assert.ok(scores.has(10 * 60));
  assert.equal(friday[0]?.stackDriveSeconds, 10 * 60);
  const firstFarIndex = friday.findIndex((slot) => slot.stackDriveSeconds === 40 * 60);
  const lastNearIndex = friday.findLastIndex((slot) => slot.stackDriveSeconds === 10 * 60);
  assert.ok(firstFarIndex > lastNearIndex);
  const morningFar = friday.find((slot) => startMs(slot.start) === et(2026, 9, 25, 10, 15).getTime());
  const afternoonNear = friday.find((slot) => startMs(slot.start) === et(2026, 9, 25, 13, 15).getTime());
  assert.ok(morningFar);
  assert.ok(afternoonNear);
  assert.equal(morningFar.stackDriveSeconds, 40 * 60);
  assert.equal(afternoonNear.stackDriveSeconds, 10 * 60);
  assert.ok(startMs(friday[0]?.start ?? "") > startMs(morningFar.start));
});

test("cross-town slots that pass travel stay offered after stacking", async () => {
  const now = et(2026, 9, 20, 9);
  const result = await offerSlotsForAddress(
    SHORE,
    {
      now,
      busy: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10) }],
      jobs: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10), address: PHILLY }],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async () => 90 * 60,
    },
    ["Real Estate · Aerial Photos"],
  );
  const elevenThirty = result.slots.find((slot) => startMs(slot.start) === et(2026, 9, 23, 11, 30).getTime());
  assert.ok(elevenThirty, "Philly 10am + 90min still leaves a Shore 11:30");
  assert.equal(elevenThirty.stackDriveSeconds, 90 * 60);
});

test("stacking reuses travel-gate drive times instead of measuring the same pair again", async () => {
  const now = et(2026, 9, 20, 9);
  const calls: string[] = [];
  const result = await offerSlotsForAddress(
    CHERRY_HILL,
    {
      now,
      busy: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10) }],
      jobs: [{ start: et(2026, 9, 23, 9), end: et(2026, 9, 23, 10), address: PHILLY }],
      calendarConfigured: true,
      driveTimeConfigured: true,
      driveSeconds: async (from, to) => {
        calls.push(`${from}|${to}`);
        return 20 * 60;
      },
    },
    ["Real Estate · Aerial Photos"],
  );
  const pairCalls = calls.filter((call) => call.includes("Philadelphia") && call.includes("Cherry Hill"));
  assert.equal(new Set(pairCalls).size, pairCalls.length, "each address pair measured once");
  assert.ok(result.slots.some((slot) => slot.dateKey === "2026-09-23" && slot.stackDriveSeconds === 20 * 60));
});

test("publicCalendarError hides STS audience mismatch details", () => {
  assert.equal(
    publicCalendarError(
      new Error(
        "Error code invalid_grant: The audience in ID Token [https://iam.googleapis.com/projects/199448014322/locations/global/workloadIdentityPools/vercel/providers/vercel] does not match the expected audience.",
      ),
    ),
    "Google Calendar authentication failed.",
  );
  assert.equal(publicCalendarError(new Error("Google Calendar free/busy 403")), "Google Calendar free/busy 403");
  assert.equal(
    publicCalendarError(
      new Error("Google Calendar free/busy 400 (timeRangeTooLong: The requested time range is too long.)"),
    ),
    "Google Calendar free/busy 400 (timeRangeTooLong: The requested time range is too long.)",
  );
});

function startMs(iso: string) {
  return new Date(iso).getTime();
}

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
