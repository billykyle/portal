import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookTimesForm } from "../../components/forms/book-times-form";
import type { AvailabilityResult } from "./availability";

const start = "2026-09-21T14:00:00.000Z";
const end = "2026-09-21T14:45:00.000Z";

const availability: AvailabilityResult = {
  address: "12 Wood View Drive, Princeton, NJ",
  timeZone: "America/New_York",
  calendarConfigured: false,
  driveTimeConfigured: false,
  firstBookableDate: "2026-09-21",
  lastBookableDate: "2026-12-21",
  notices: [],
  slots: [
    {
      start,
      end,
      dateKey: "2026-09-21",
      dateLabel: "Monday, Sep 21",
      timeLabel: "10:00 AM",
      driveSecondsFromPrior: null,
    },
  ],
};

test("new bookings do not auto-select a clock time", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography"],
    }),
  );
  assert.match(html, /type="radio"/);
  assert.doesNotMatch(html, /checked/);
});

test("the first day with a slot in the opening week is expanded", () => {
  const laterStart = "2026-09-25T14:00:00.000Z";
  const laterEnd = "2026-09-25T14:45:00.000Z";
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability: {
        ...availability,
        firstBookableDate: "2026-09-20",
        lastBookableDate: "2026-12-20",
        slots: [
          availability.slots[0],
          {
            start: laterStart,
            end: laterEnd,
            dateKey: "2026-09-25",
            dateLabel: "Friday, Sep 25",
            timeLabel: "10:00 AM – 10:45 AM",
            driveSecondsFromPrior: null,
          },
        ],
      },
      services: ["Real Estate · Photography"],
    }),
  );
  assert.match(html, /Monday, Sep 21/);
  assert.match(html, /Friday, Sep 25/);
  assert.match(html, /aria-label="Monday, Sep 21"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*aria-label="Monday, Sep 21"/);
  assert.match(html, /aria-label="Friday, Sep 25"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="Friday, Sep 25"/);
  assert.doesNotMatch(html, /checked/);
});

test("book times radios post a named slot value the server can read", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography"],
      notes: "Gate on the left",
      error: "That time is no longer available. Pick another.",
    }),
  );
  assert.match(html, /name="slot"/);
  assert.match(html, new RegExp(`value="${start}\\|${end}"`));
  assert.match(html, /type="radio"/);
  assert.match(html, /That time is no longer available/);
  assert.match(html, /id="book-shoot-error"/);
  assert.match(html, /Date options further out/);
  assert.doesNotMatch(html, /Step \d+ of \d+/);
  assert.doesNotMatch(html, /Date Options Further Out/);
  assert.doesNotMatch(html, /Further Date Options/);
  assert.doesNotMatch(html, /type="hidden"[^>]*name="slot"/);
});

test("modify times form posts bookingId and keeps Save changes", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography"],
      notes: "Code 1234",
      modifyBookingId: "11111111-1111-4111-8111-111111111111",
      currentSlot: `${start}|${end}`,
    }),
  );
  assert.match(html, /name="bookingId"/);
  assert.match(html, /11111111-1111-4111-8111-111111111111/);
  assert.match(html, /Save changes/);
  assert.doesNotMatch(html, /Step \d+ of \d+/);
  assert.doesNotMatch(html, /Book shoot/);
  assert.match(html, /modify=11111111-1111-4111-8111-111111111111/);
  assert.doesNotMatch(html, /name="fromAdmin"/);
  assert.match(html, /checked/);
  assert.match(html, new RegExp(`value="${start}\\|${end}"[^>]*checked|checked[^>]*value="${start}\\|${end}"`));
});

test("address is the prominent title above secondary services", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
    }),
  );
  const addressAt = html.indexOf("12 Wood View Drive, Princeton, NJ");
  const serviceAt = html.indexOf("Real Estate · Photography");
  assert.ok(addressAt >= 0);
  assert.ok(serviceAt > addressAt);
  assert.match(
    html,
    /<p class="text-\[15px\] font-medium leading-snug">12 Wood View Drive, Princeton, NJ<\/p>/,
  );
  assert.match(html, /<li class="text-sm text-\[#8e8e93\]">Real Estate · Photography<\/li>/);
  assert.match(html, /<li class="text-sm text-\[#8e8e93\]">Real Estate · Aerial Photos<\/li>/);
  assert.doesNotMatch(html, /<li class="text-\[15px\]">/);
});

test("selected and unselected times keep the same row box", () => {
  const laterStart = "2026-09-21T15:00:00.000Z";
  const laterEnd = "2026-09-21T15:45:00.000Z";
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability: {
        ...availability,
        slots: [
          availability.slots[0],
          {
            ...availability.slots[0],
            start: laterStart,
            end: laterEnd,
            timeLabel: "11:00 AM",
          },
        ],
      },
      services: ["Real Estate · Photography"],
      currentSlot: `${start}|${end}`,
    }),
  );
  const labels = [...html.matchAll(/<label class="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(labels.length, 2);
  const layout =
    /flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3/;
  for (const className of labels) {
    assert.match(className, layout);
  }
  const selected = labels.filter((className) => className.includes("border-white "));
  const unselected = labels.filter((className) => className.includes("border-transparent"));
  assert.equal(selected.length, 1);
  assert.match(selected[0], /border-white bg-white\/5/);
  assert.doesNotMatch(selected[0], /border-transparent/);
  assert.equal(unselected.length, 1);
  assert.doesNotMatch(unselected[0], /bg-white/);
  assert.doesNotMatch(html, /has-\[:checked\]:border-white/);
});

test("admin times form posts fromAdmin and keeps the admin change link", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography"],
      modifyBookingId: "11111111-1111-4111-8111-111111111111",
      currentSlot: `${start}|${end}`,
      fromAdmin: true,
    }),
  );
  assert.match(html, /name="fromAdmin"/);
  assert.match(html, /value="1"/);
  assert.match(html, /href="\/admin\/bookings\/11111111-1111-4111-8111-111111111111/);
});

test("refreshing keeps the last slots and the loading sentence", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability,
      services: ["Real Estate · Photography"],
      refreshing: true,
    }),
  );
  assert.match(html, /Loading your available times…/);
  assert.match(html, /10:00 AM/);
  assert.doesNotMatch(html, /No times fit this address right now/);
});

test("week list greys today and blocked weekdays as no time available", () => {
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability: {
        ...availability,
        firstBookableDate: "2026-09-20",
        lastBookableDate: "2026-12-20",
      },
      services: ["Real Estate · Photography"],
    }),
  );
  assert.match(html, /Sunday, Sep 20 - no time available/);
  assert.match(html, /Tuesday, Sep 22 - no time available/);
  assert.match(html, /Saturday, Sep 26 - no time available/);
  assert.match(html, /Monday, Sep 21/);
  assert.doesNotMatch(html, /Monday, Sep 21 - no time available/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /cursor-not-allowed/);
});

test("modify on a blocked weekday still preselects the existing start", () => {
  const tuesdayStart = "2026-09-22T18:00:00.000Z";
  const tuesdayEnd = "2026-09-22T18:45:00.000Z";
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability: {
        ...availability,
        firstBookableDate: "2026-09-21",
        lastBookableDate: "2026-12-21",
        slots: [
          {
            start: tuesdayStart,
            end: tuesdayEnd,
            dateKey: "2026-09-22",
            dateLabel: "Tuesday, Sep 22",
            timeLabel: "2:00 PM – 2:45 PM",
            driveSecondsFromPrior: null,
          },
        ],
      },
      services: ["Real Estate · Photography"],
      modifyBookingId: "11111111-1111-4111-8111-111111111111",
      currentSlot: `${tuesdayStart}|${tuesdayEnd}`,
    }),
  );
  assert.match(html, /Tuesday, Sep 22/);
  assert.doesNotMatch(html, /Tuesday, Sep 22 - no time available/);
  assert.match(html, new RegExp(`value="${tuesdayStart}\\|${tuesdayEnd}"`));
  assert.match(html, /checked/);
});

test("modify pre-selects the current start when duration changes", () => {
  const longerEnd = "2026-09-21T14:15:00.000Z";
  const html = renderToStaticMarkup(
    createElement(BookTimesForm, {
      availability: {
        ...availability,
        slots: [
          {
            ...availability.slots[0],
            end: longerEnd,
            timeLabel: "10:00 AM – 10:15 AM",
          },
        ],
      },
      services: ["Real Estate · Photography", "Real Estate · Aerial Photos"],
      modifyBookingId: "11111111-1111-4111-8111-111111111111",
      currentSlot: `${start}|${end}`,
    }),
  );
  assert.match(html, new RegExp(`value="${start}\\|${longerEnd}"`));
  assert.match(html, /checked/);
});
