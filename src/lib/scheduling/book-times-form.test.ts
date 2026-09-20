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
  assert.doesNotMatch(html, /type="hidden"[^>]*name="slot"/);
});
