import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_CATEGORY_SERVICES } from "./category-services";
import { offerSlotsForAddress } from "./availability";
import { DEFAULT_TIMEZONE } from "./rules";
import { SCHEDULING_INDUSTRIES, SCHEDULING_SERVICES } from "./services";
import {
  TWILIGHT_DAY_TAKEN,
  phillySunset,
  roundDownToQuarterHour,
  twilightDayConflict,
  twilightSlotForCalendarDate,
} from "./twilight";
import { utcToZonedParts, zonedDateTimeToUtc, type CalendarDate } from "./zoned-time";

const PHILLY = "1500 Market Street, Philadelphia, PA";

function et(year: number, month: number, day: number, hour: number, minute = 0) {
  return zonedDateTimeToUtc(DEFAULT_TIMEZONE, { year, month, day, hour, minute });
}

test("sunset rounds down to the previous 15-minute mark", () => {
  assert.deepEqual(roundDownToQuarterHour({ hour: 18, minute: 4, second: 0 }), { hour: 18, minute: 0 });
  assert.deepEqual(roundDownToQuarterHour({ hour: 17, minute: 56, second: 0 }), { hour: 17, minute: 45 });
  assert.deepEqual(roundDownToQuarterHour({ hour: 18, minute: 0, second: 0 }), { hour: 18, minute: 0 });
  assert.deepEqual(roundDownToQuarterHour({ hour: 18, minute: 0, second: 30 }), { hour: 18, minute: 0 });
  assert.deepEqual(roundDownToQuarterHour({ hour: 18, minute: 14, second: 59 }), { hour: 18, minute: 0 });
  assert.deepEqual(roundDownToQuarterHour({ hour: 18, minute: 15, second: 0 }), { hour: 18, minute: 15 });
});

test("Philadelphia sunset stays on Eastern time across DST", () => {
  const cases: Array<{
    date: CalendarDate;
    sunset: { hour: number; minute: number; second: number };
    slot: string;
  }> = [
    {
      date: { year: 2026, month: 1, day: 15 },
      sunset: { hour: 17, minute: 0, second: 8 },
      slot: "2026-01-15T22:00:00.000Z",
    },
    {
      date: { year: 2026, month: 3, day: 7 },
      sunset: { hour: 17, minute: 59, second: 10 },
      slot: "2026-03-07T22:45:00.000Z",
    },
    {
      date: { year: 2026, month: 3, day: 8 },
      sunset: { hour: 19, minute: 0, second: 14 },
      slot: "2026-03-08T23:00:00.000Z",
    },
    {
      date: { year: 2026, month: 6, day: 21 },
      sunset: { hour: 20, minute: 32, second: 53 },
      slot: "2026-06-22T00:30:00.000Z",
    },
    {
      date: { year: 2026, month: 10, day: 6 },
      sunset: { hour: 18, minute: 34, second: 51 },
      slot: "2026-10-06T22:30:00.000Z",
    },
    {
      date: { year: 2026, month: 11, day: 1 },
      sunset: { hour: 16, minute: 58, second: 13 },
      slot: "2026-11-01T21:45:00.000Z",
    },
    {
      date: { year: 2026, month: 12, day: 21 },
      sunset: { hour: 16, minute: 38, second: 49 },
      slot: "2026-12-21T21:30:00.000Z",
    },
  ];

  for (const item of cases) {
    const sunset = phillySunset(item.date);
    assert.ok(sunset, `${item.date.month}/${item.date.day} has a sunset`);
    const parts = utcToZonedParts(sunset, DEFAULT_TIMEZONE);
    assert.deepEqual(
      { hour: parts.hour, minute: parts.minute, second: parts.second },
      item.sunset,
      `sunset ${item.date.year}-${item.date.month}-${item.date.day}`,
    );
    const slot = twilightSlotForCalendarDate(item.date);
    assert.ok(slot);
    assert.equal(slot.start.toISOString(), item.slot);
    assert.equal(slot.end.getTime() - slot.start.getTime(), 30 * 60 * 1000);
  }

  const winter = twilightSlotForCalendarDate({ year: 2026, month: 1, day: 15 })!;
  const summer = twilightSlotForCalendarDate({ year: 2026, month: 6, day: 21 })!;
  assert.equal(utcToZonedParts(winter.start, DEFAULT_TIMEZONE).hour, 17);
  assert.equal(utcToZonedParts(summer.start, DEFAULT_TIMEZONE).hour, 20);
});

test("only one confirmed Twilight is allowed on an Eastern day", () => {
  const first = {
    id: "a",
    status: "confirmed",
    services: ["Real Estate · Twilight"],
    startsAt: et(2026, 6, 24, 16),
    twilightDay: "2026-06-24",
  };
  assert.equal(
    twilightDayConflict(
      { services: ["Real Estate · Twilight"], start: et(2026, 6, 24, 20, 30) },
      [first],
    ),
    TWILIGHT_DAY_TAKEN,
  );
  assert.equal(
    twilightDayConflict(
      { id: "a", services: ["Real Estate · Twilight"], start: et(2026, 6, 24, 20, 30) },
      [first],
    ),
    null,
  );
  assert.equal(
    twilightDayConflict(
      { services: ["Real Estate · Twilight"], start: et(2026, 6, 25, 20, 30) },
      [first],
    ),
    null,
  );
  assert.equal(
    twilightDayConflict(
      { services: ["Real Estate · Twilight"], start: et(2026, 6, 24, 20, 30) },
      [{ ...first, status: "cancelled" }],
    ),
    null,
  );
  assert.equal(
    twilightDayConflict(
      { services: ["Real Estate · Photography"], start: et(2026, 6, 24, 10) },
      [first],
    ),
    null,
  );
  assert.equal(
    twilightDayConflict(
      { services: ["Real Estate · Twilight"], start: et(2026, 6, 24, 20, 30) },
      [{ status: "confirmed", services: ["Real Estate · Twilight"], startsAt: et(2026, 6, 24, 16) }],
    ),
    TWILIGHT_DAY_TAKEN,
  );
});

test("Twilight sits under Aerial Photos and above Zillow 360", () => {
  const realEstate = SCHEDULING_INDUSTRIES.find((group) => group.industry === "Real Estate");
  assert.ok(realEstate);
  assert.deepEqual(
    [...realEstate.options],
    ["Photography", "Video", "Aerial Photos", "Twilight", "Zillow 360", "Exterior Only"],
  );
  const ids = SCHEDULING_SERVICES.filter((service) => service.startsWith("Real Estate · "));
  assert.deepEqual(ids, [
    "Real Estate · Photography",
    "Real Estate · Video",
    "Real Estate · Aerial Photos",
    "Real Estate · Twilight",
    "Real Estate · Zillow 360",
    "Real Estate · Exterior Only",
  ]);
  assert.deepEqual(CLIENT_CATEGORY_SERVICES.real_estate.slice(0, 6), ids);
  assert.ok(CLIENT_CATEGORY_SERVICES.other.includes("Real Estate · Twilight"));
  assert.equal(CLIENT_CATEGORY_SERVICES.construction.includes("Real Estate · Twilight"), false);
});

test("the client slot list offers only the free sunset window, one per day", async () => {
  const now = et(2026, 6, 22, 9);
  const sources = {
    now,
    busy: [] as { start: Date; end: Date }[],
    jobs: [],
    calendarConfigured: true,
    driveTimeConfigured: true,
    driveSeconds: async () => null,
  };
  const open = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Twilight"]);
  assert.equal(open.error, undefined);
  const byDay = new Map<string, number>();
  for (const slot of open.slots) {
    byDay.set(slot.dateKey, (byDay.get(slot.dateKey) ?? 0) + 1);
    const [year, month, day] = slot.dateKey.split("-").map(Number);
    const expected = twilightSlotForCalendarDate({ year: year!, month: month!, day: day! });
    assert.ok(expected);
    assert.equal(slot.start, expected.start.toISOString());
    assert.equal(slot.end, expected.end.toISOString());
  }
  for (const count of byDay.values()) assert.equal(count, 1);
  assert.equal(byDay.has("2026-06-22"), false);
  assert.equal(byDay.has("2026-06-23"), false);
  assert.equal(byDay.has("2026-06-24"), true);
  assert.equal(open.slots.some((slot) => slot.timeLabel.startsWith("10:")), false);

  const wednesday = twilightSlotForCalendarDate({ year: 2026, month: 6, day: 24 })!;
  const busy = await offerSlotsForAddress(
    PHILLY,
    { ...sources, busy: [{ start: wednesday.start, end: wednesday.end }] },
    ["Real Estate · Twilight"],
  );
  assert.equal(
    busy.slots.some((slot) => slot.dateKey === "2026-06-24"),
    false,
  );

  const daytime = await offerSlotsForAddress(
    PHILLY,
    { ...sources, busy: [{ start: et(2026, 6, 24, 14), end: et(2026, 6, 24, 15) }] },
    ["Real Estate · Twilight"],
  );
  assert.equal(
    daytime.slots.some((slot) => slot.dateKey === "2026-06-24"),
    true,
  );

  const taken = await offerSlotsForAddress(PHILLY, sources, ["Real Estate · Twilight"], {
    twilightBookedDays: ["2026-06-24"],
  });
  assert.equal(
    taken.slots.some((slot) => slot.dateKey === "2026-06-24"),
    false,
  );
  assert.equal(
    taken.slots.some((slot) => slot.dateKey === "2026-06-25"),
    true,
  );
});
