import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookTwilightPairForm } from "../../components/forms/book-twilight-pair-form";
import { offerSlotsForAddress, type AvailabilityResult } from "./availability";
import { DEFAULT_TIMEZONE } from "./rules";
import { bookingSlotMinutes, toggleSchedulingService } from "./services";
import { TWILIGHT_ALONE_ERROR, TWILIGHT_DAY_TAKEN } from "./twilight";
import {
  commitTwilightPair,
  preferredTwilightSlot,
  regularSlotMinutes,
  TWILIGHT_PAIR_FAILED,
  TWILIGHT_PAIR_OVERLAP,
  twilightBookingFlow,
  twilightSlotsBeside,
  type TwilightPairCommitInput,
  type TwilightPairDeps,
  type TwilightPairRow,
} from "./twilight-pair";
import { zonedDateTimeToUtc } from "./zoned-time";

const PHILLY = "1500 Market Street, Philadelphia, PA";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("twilight flow branches on whether other services are selected", () => {
  assert.equal(twilightBookingFlow(["Real Estate · Photography"]).kind, "standard");
  assert.equal(twilightBookingFlow(["Real Estate · Twilight"]).kind, "twilight");
  const paired = twilightBookingFlow(["Real Estate · Photography", "Real Estate · Twilight", "Real Estate · Video"]);
  assert.equal(paired.kind, "paired");
  if (paired.kind !== "paired") return;
  assert.deepEqual(paired.regular, ["Real Estate · Photography", "Real Estate · Video"]);
  assert.deepEqual(paired.twilight, ["Real Estate · Twilight"]);
  assert.equal(regularSlotMinutes(["Real Estate · Photography", "Real Estate · Twilight"]), 45);
  assert.equal(bookingSlotMinutes(["Real Estate · Photography", "Real Estate · Twilight"]), 75);
  assert.deepEqual(
    toggleSchedulingService(["Real Estate · Photography"], "Real Estate · Twilight", { pairTwilight: true }),
    ["Real Estate · Photography", "Real Estate · Twilight"],
  );
  assert.deepEqual(
    toggleSchedulingService(["Real Estate · Photography", "Real Estate · Twilight"], "Real Estate · Video", {
      pairTwilight: true,
    }),
    ["Real Estate · Photography", "Real Estate · Video", "Real Estate · Twilight"],
  );
});

test("a mixed Twilight request does not collapse the regular grid into sunset slots", async () => {
  const now = et(2026, 6, 22, 9);
  const sources = {
    now,
    busy: [] as { start: Date; end: Date }[],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  };
  const mixed = await offerSlotsForAddress(PHILLY, sources, [
    "Real Estate · Photography",
    "Real Estate · Twilight",
  ]);
  assert.equal(mixed.error, TWILIGHT_ALONE_ERROR);
  assert.equal(mixed.slots.length, 0);

  const photo = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Photography"]);
  const wednesday = photo.slots.find((slot) => slot.dateKey === "2026-06-24");
  assert.ok(wednesday);
  assert.equal(new Date(wednesday.end).getTime() - new Date(wednesday.start).getTime(), 45 * 60 * 1000);
  assert.equal(photo.slots.some((slot) => slot.timeLabel.startsWith("10:")), true);
});

test("sunset choices drop a window that overlaps the other appointment and keep the same day otherwise", () => {
  const slots = [
    { start: "2026-06-24T22:30:00.000Z", end: "2026-06-24T23:00:00.000Z", dateKey: "2026-06-24" },
    { start: "2026-06-25T22:30:00.000Z", end: "2026-06-25T23:00:00.000Z", dateKey: "2026-06-25" },
  ];
  const clear = twilightSlotsBeside({ start: "2026-06-24T14:00:00.000Z", end: "2026-06-24T14:45:00.000Z" }, slots);
  assert.equal(clear.length, 2);
  assert.equal(preferredTwilightSlot("2026-06-24", clear)?.dateKey, "2026-06-24");

  const hitting = twilightSlotsBeside(
    { start: "2026-06-24T22:00:00.000Z", end: "2026-06-24T22:45:00.000Z" },
    slots,
  );
  assert.deepEqual(hitting.map((slot) => slot.dateKey), ["2026-06-25"]);
  assert.equal(preferredTwilightSlot("2026-06-24", hitting), null);
  assert.equal(preferredTwilightSlot("2026-06-25", hitting)?.start, slots[1]?.start);

  const touching = twilightSlotsBeside(
    { start: "2026-06-24T22:00:00.000Z", end: "2026-06-24T22:30:00.000Z" },
    slots,
  );
  assert.equal(touching.length, 2);
});

function row(start: Date, end: Date, services: string[]): TwilightPairRow {
  return {
    clientId: "client-1",
    createdByUserId: "user-1",
    address: PHILLY,
    services,
    commercialVideoHours: null,
    startsAt: start,
    endsAt: end,
    notes: null,
    accessCodes: null,
    driveSecondsFromPrior: null,
  };
}

function pairInput(overrides?: Partial<TwilightPairCommitInput>): TwilightPairCommitInput {
  return {
    regular: row(et(2026, 6, 24, 10), et(2026, 6, 24, 10, 45), ["Real Estate · Photography"]),
    twilight: row(et(2026, 6, 24, 20, 30), et(2026, 6, 24, 21), ["Real Estate · Twilight"]),
    calendarConfigured: true,
    regularCalendar: {
      address: PHILLY,
      start: et(2026, 6, 24, 10),
      end: et(2026, 6, 24, 10, 45),
      timeZone: DEFAULT_TIMEZONE,
      summary: "Sam Lepore - P",
      description: "day",
    },
    twilightCalendar: {
      address: PHILLY,
      start: et(2026, 6, 24, 20, 30),
      end: et(2026, 6, 24, 21),
      timeZone: DEFAULT_TIMEZONE,
      summary: "Sam Lepore - Twilight",
      description: "sunset",
    },
    ...overrides,
  };
}

function memoryDeps(behavior?: {
  twilightInsert?: "fail" | "throw";
  twilightCalendar?: "fail";
  dayTaken?: boolean;
}): { deps: TwilightPairDeps; inserted: string[]; deleted: string[]; calendars: string[]; emails: number } {
  const inserted: string[] = [];
  const deleted: string[] = [];
  const calendars: string[] = [];
  const state = { emails: 0 };
  let n = 0;
  const deps: TwilightPairDeps = {
    async insertBooking(row) {
      n += 1;
      if (n === 2 && behavior?.twilightInsert === "throw") {
        const error = new Error('duplicate key value violates unique constraint "bookings_one_twilight_per_day"');
        throw error;
      }
      if (n === 2 && behavior?.twilightInsert === "fail") return null;
      const id = row.services.includes("Real Estate · Twilight") ? "twilight-id" : "regular-id";
      inserted.push(id);
      return { id };
    },
    async deleteBooking(id) {
      deleted.push(id);
    },
    async twilightDayTaken() {
      return Boolean(behavior?.dayTaken);
    },
    async writeCalendar(bookingId) {
      if (bookingId === "twilight-id" && behavior?.twilightCalendar === "fail") return { ok: false };
      const eventId = bookingId === "twilight-id" ? "event-twi" : "event-reg";
      calendars.push(eventId);
      return { ok: true, eventId };
    },
    async deleteCalendar(eventId) {
      calendars.splice(calendars.indexOf(eventId), 1);
    },
    async saveCalendarId() {},
    async sendPairEmail() {
      state.emails += 1;
      return { emailFailed: false };
    },
  };
  return {
    deps,
    inserted,
    deleted,
    calendars,
    get emails() {
      return state.emails;
    },
  };
}

test("overlapping pair slots create nothing", async () => {
  const bag = memoryDeps();
  const result = await commitTwilightPair(
    pairInput({
      twilight: row(et(2026, 6, 24, 10, 30), et(2026, 6, 24, 11), ["Real Estate · Twilight"]),
    }),
    bag.deps,
  );
  assert.deepEqual(result, { ok: false, error: TWILIGHT_PAIR_OVERLAP });
  assert.deepEqual(bag.inserted, []);
  assert.deepEqual(bag.deleted, []);
});

test("a Twilight insert failure rolls back the daytime booking", async () => {
  const bag = memoryDeps({ twilightInsert: "throw" });
  const result = await commitTwilightPair(pairInput(), bag.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, TWILIGHT_DAY_TAKEN);
  assert.deepEqual(bag.inserted, ["regular-id"]);
  assert.deepEqual(bag.deleted, ["regular-id"]);
  assert.equal(bag.emails, 0);
});

test("a null Twilight insert rolls back with the pair error", async () => {
  const bag = memoryDeps({ twilightInsert: "fail" });
  const result = await commitTwilightPair(pairInput(), bag.deps);
  assert.deepEqual(result, { ok: false, error: TWILIGHT_PAIR_FAILED });
  assert.deepEqual(bag.deleted, ["regular-id"]);
});

test("a Twilight calendar failure removes both bookings and the daytime event", async () => {
  const bag = memoryDeps({ twilightCalendar: "fail" });
  const result = await commitTwilightPair(pairInput(), bag.deps);
  assert.deepEqual(result, { ok: false, error: TWILIGHT_PAIR_FAILED });
  assert.deepEqual(bag.deleted, ["twilight-id", "regular-id"]);
  assert.deepEqual(bag.calendars, []);
  assert.equal(bag.emails, 0);
});

test("a taken Twilight day creates nothing", async () => {
  const bag = memoryDeps({ dayTaken: true });
  const result = await commitTwilightPair(pairInput(), bag.deps);
  assert.deepEqual(result, { ok: false, error: TWILIGHT_DAY_TAKEN });
  assert.deepEqual(bag.inserted, []);
});

test("a confirmation email failure keeps both bookings", async () => {
  const bag = memoryDeps();
  bag.deps.sendPairEmail = async () => {
    throw new Error("resend down");
  };
  const result = await commitTwilightPair(pairInput(), bag.deps);
  assert.deepEqual(result, { ok: true, regularId: "regular-id", twilightId: "twilight-id", emailFailed: true });
  assert.deepEqual(bag.deleted, []);
});

test("a clear pair writes two calendar events and one confirmation", async () => {
  const saved: string[] = [];
  const bag = memoryDeps();
  bag.deps.saveCalendarId = async (bookingId, eventId) => {
    saved.push(`${bookingId}:${eventId}`);
  };
  const result = await commitTwilightPair(
    pairInput({
      twilight: row(et(2026, 6, 25, 20, 30), et(2026, 6, 25, 21), ["Real Estate · Twilight"]),
      twilightCalendar: {
        address: PHILLY,
        start: et(2026, 6, 25, 20, 30),
        end: et(2026, 6, 25, 21),
        timeZone: DEFAULT_TIMEZONE,
        summary: "Sam Lepore - Twilight",
        description: "sunset",
      },
    }),
    bag.deps,
  );
  assert.deepEqual(result, { ok: true, regularId: "regular-id", twilightId: "twilight-id", emailFailed: false });
  assert.deepEqual(bag.inserted, ["regular-id", "twilight-id"]);
  assert.deepEqual(bag.deleted, []);
  assert.deepEqual(bag.calendars, ["event-reg", "event-twi"]);
  assert.deepEqual(saved, ["regular-id:event-reg", "twilight-id:event-twi"]);
  assert.equal(bag.emails, 1);
});

const availability = (slots: AvailabilityResult["slots"]): AvailabilityResult => ({
  address: PHILLY,
  timeZone: DEFAULT_TIMEZONE,
  calendarConfigured: true,
  driveTimeConfigured: true,
  firstBookableDate: "2026-06-24",
  lastBookableDate: "2026-09-24",
  notices: [],
  slots,
});

test("the paired times form starts on the regular grid, not the sunset list", () => {
  const html = renderToStaticMarkup(
    createElement(BookTwilightPairForm, {
      regularAvailability: availability([
        {
          start: "2026-06-24T14:00:00.000Z",
          end: "2026-06-24T14:45:00.000Z",
          dateKey: "2026-06-24",
          dateLabel: "Wednesday, Jun 24",
          timeLabel: "10:00 AM",
          driveSecondsFromPrior: null,
        },
      ]),
      twilightAvailability: availability([
        {
          start: "2026-06-24T23:30:00.000Z",
          end: "2026-06-25T00:00:00.000Z",
          dateKey: "2026-06-24",
          dateLabel: "Wednesday, Jun 24",
          timeLabel: "7:30 PM",
          driveSecondsFromPrior: null,
        },
      ]),
      regularServices: ["Real Estate · Photography"],
      services: ["Real Estate · Photography", "Real Estate · Twilight"],
      notes: "",
      placeId: "",
    }),
  );
  assert.match(html, /Step 1 of 2/);
  assert.match(html, /<li class="text-sm text-\[#8e8e93\]">Real Estate · Photography<\/li>/);
  assert.doesNotMatch(html, /<li class="text-sm text-\[#8e8e93\]">Real Estate · Twilight<\/li>/);
  assert.match(html, /10:00 AM/);
  assert.match(html, />Continue</);
  assert.doesNotMatch(html, /7:30 PM/);
});
