import assert from "node:assert/strict";
import { test } from "node:test";
import { parseShootAddress, sameAddress } from "./address";
import { offerSlotsForAddress } from "./availability";
import { schedulingIntegrations } from "./config";
import { mergeIntervals, overlaps } from "./intervals";
import { DEFAULT_TIMEZONE, TRAVEL_PAD_MINUTES } from "./rules";
import { generateCandidateSlots } from "./slots";
import { pickPriorJob, travelFits } from "./travel";
import { zonedDateTimeToUtc } from "./zoned-time";

const PHILLY = "1500 Market Street, Philadelphia, PA";
const SHORE = "100 1st Avenue, Avalon, NJ";

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
    assert.match(verdict.reason, /15-minute pad/);
  }
});

test("a later Shore slot is offered when live drive + pad fits", () => {
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

test("same-address jobs only need the 15-minute pad", () => {
  const prior = { start: et(2026, 9, 21, 9), end: et(2026, 9, 21, 10, 30), address: PHILLY };
  const tooSoon = travelFits({
    slot: { start: et(2026, 9, 21, 10, 40), end: et(2026, 9, 21, 12, 10) },
    newAddress: PHILLY,
    prior,
    next: null,
    driveSeconds: () => {
      throw new Error("should not measure same-address travel");
    },
  });
  assert.equal(tooSoon.ok, false);

  const ok = travelFits({
    slot: { start: et(2026, 9, 21, 10, 45), end: et(2026, 9, 21, 12, 15) },
    newAddress: PHILLY,
    prior,
    next: null,
    driveSeconds: () => {
      throw new Error("should not measure same-address travel");
    },
  });
  assert.equal(ok.ok, true);
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

test("candidate slots stay inside working hours in America/New_York", () => {
  const slots = generateCandidateSlots({
    now: et(2026, 9, 21, 6),
    timeZone: DEFAULT_TIMEZONE,
    openHour: 8,
    closeHour: 18,
    slotMinutes: 90,
    stepMinutes: 30,
    daysAhead: 1,
    minLeadMinutes: 0,
  });
  assert.ok(slots.length > 0);
  assert.equal(slots[0].start.getTime(), et(2026, 9, 21, 8).getTime());
  const last = slots[slots.length - 1];
  assert.equal(last.start.getTime(), et(2026, 9, 21, 16, 30).getTime());
  assert.equal(last.end.getTime(), et(2026, 9, 21, 18).getTime());
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

test("sameAddress ignores punctuation and country suffix", () => {
  assert.equal(sameAddress("1500 Market St., Philadelphia, PA, USA", "1500 Market St, Philadelphia, PA"), true);
});

test("env hooks stay off when Calendar/Maps credentials are missing", () => {
  const previous = {
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  };
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.GOOGLE_CLIENT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const integrations = schedulingIntegrations();
  assert.equal(integrations.calendarConfigured, false);
  assert.equal(integrations.driveTimeConfigured, false);
  assert.equal(integrations.placesConfigured, false);
  restoreEnv(previous);
});

test("travel pad is locked at 15 minutes", () => {
  assert.equal(TRAVEL_PAD_MINUTES, 15);
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
