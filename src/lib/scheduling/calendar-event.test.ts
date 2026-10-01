import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CALENDAR_EVENT_FOOTER,
  calendarClientName,
  calendarEventCopy,
  calendarEventDescription,
  calendarEventTitle,
  calendarTitleLockbox,
} from "./calendar-event";

const photo = "Real Estate · Photography";
const aerial = "Real Estate · Aerial Photos";

test("calendar name prefers first + last over displayName and never uses company", () => {
  assert.equal(
    calendarClientName({ firstName: "Billy", lastName: "Kyle", displayName: "Atmos Imagery" }),
    "Billy Kyle",
  );
  assert.equal(calendarClientName({ firstName: "Billy", lastName: null, displayName: "Atmos" }), "Billy");
  assert.equal(calendarClientName({ firstName: null, lastName: null, displayName: "Sam Lepore" }), "Sam Lepore");
  assert.equal(calendarClientName({ firstName: "  ", lastName: "", displayName: "  Whitfield  " }), "Whitfield");
  assert.equal(calendarClientName({ firstName: null, lastName: null, displayName: null }), "");
});

test("calendar title keeps an email inside notes as typed", () => {
  assert.equal(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      address: "1 Main St",
      services: ["Real Estate · Photography"],
      notes: "cc: pat@example.com",
    }),
    "Billy Kyle - P (cc: pat@example.com)",
  );
});

test("title lockbox is notes as typed; empty notes means no parens", () => {
  assert.equal(calendarTitleLockbox("1234"), "1234");
  assert.equal(calendarTitleLockbox("  1234  "), "1234");
  assert.equal(calendarTitleLockbox("Park in the driveway."), "Park in the driveway.");
  assert.equal(calendarTitleLockbox(""), null);
  assert.equal(calendarTitleLockbox("   "), null);
  assert.equal(calendarTitleLockbox(null), null);
});

test("calendar title uses notes in parens and ignores accessCodes", () => {
  assert.equal(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      displayName: "Atmos Imagery",
      address: "644 Plumrun Dr",
      services: [photo],
      notes: "1234",
      accessCodes: "9999",
    }),
    "Billy Kyle - P (1234)",
  );
  assert.equal(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      address: "644 Plumrun Dr",
      services: [photo, aerial],
      accessCodes: "1234",
    }),
    "Billy Kyle - P AP",
  );
  assert.equal(
    calendarEventTitle({
      displayName: "Sam Lepore",
      address: "12 Wood View Drive",
      services: [photo],
      notes: "1234",
    }),
    "Sam Lepore - P (1234)",
  );
  assert.equal(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      company: "Atmos Imagery",
      address: "644 Plumrun Dr",
      services: [photo],
      notes: "Park in the driveway.",
    }),
    "Billy Kyle - P (Park in the driveway.)",
  );
  assert.doesNotMatch(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      company: "Atmos Imagery",
      address: "644 Plumrun Dr",
      services: [photo],
      notes: "1234",
    }),
    /Atmos/,
  );
});

test("calendar description is a labeled list ending with the portal footer", () => {
  const description = calendarEventDescription({
    firstName: "Billy",
    lastName: "Kyle",
    displayName: "Atmos Imagery",
    email: "billy@billyhere.com",
    phone: "215-555-0100",
    company: "Atmos Imagery",
    address: "644 Plumrun Dr, West Chester, PA",
    services: [photo, aerial],
    notes: "Park in the driveway.",
    accessCodes: "1234",
  });
  assert.equal(
    description,
    [
      "Name: Billy Kyle",
      "Email: billy@billyhere.com",
      "Phone: 215-555-0100",
      "Company: Atmos Imagery",
      "Address: 644 Plumrun Dr, West Chester, PA",
      "Services: Real Estate · Photography, Real Estate · Aerial Photos",
      "Access codes: 1234",
      "Notes: Park in the driveway.",
      "",
      CALENDAR_EVENT_FOOTER,
    ].join("\n"),
  );
  assert.ok(description.endsWith(CALENDAR_EVENT_FOOTER));
  assert.equal(description.match(/Booked through your portal/g)?.length, 1);
});

test("calendar description omits empty fields and never puts company in the title", () => {
  const copy = calendarEventCopy({
    displayName: "Sam Lepore",
    email: "sam@example.com",
    address: "12 Wood View Drive",
    services: [photo],
    notes: "   ",
    company: null,
    phone: null,
  });
  assert.equal(copy.summary, "Sam Lepore - P");
  assert.equal(
    copy.description,
    [
      "Name: Sam Lepore",
      "Email: sam@example.com",
      "Address: 12 Wood View Drive",
      "Services: Real Estate · Photography",
      "",
      CALENDAR_EVENT_FOOTER,
    ].join("\n"),
  );
  assert.doesNotMatch(copy.description, /Phone:|Company:|Notes:|Access codes:/);
  assert.doesNotMatch(copy.summary, /Real Estate|Construction/);
});

test("calendar title uses service initials in catalog order and keeps notes", () => {
  const jane = { displayName: "Jane Doe", address: "1 Main St" };
  assert.equal(calendarEventTitle({ ...jane, services: ["Real Estate · Photography"] }), "Jane Doe - P");
  assert.equal(
    calendarEventTitle({
      ...jane,
      services: ["Real Estate · Photography", "Real Estate · Video", "Real Estate · Aerial Photos"],
    }),
    "Jane Doe - P V AP",
  );
  assert.equal(
    calendarEventTitle({
      ...jane,
      services: ["Construction · Photography", "Real Estate · Video", "Real Estate · Aerial Photos"],
    }),
    "Jane Doe - P V AP",
  );
  assert.equal(calendarEventTitle({ ...jane, services: ["Podcast · 1 episode"] }), "Jane Doe - Podcast");
  assert.equal(calendarEventTitle({ ...jane, services: ["Podcast · 2 episodes"] }), "Jane Doe - Podcast");
  assert.equal(
    calendarEventTitle({ ...jane, services: ["Podcast · 1 episode", "Podcast · 2 episodes"] }),
    "Jane Doe - Podcast",
  );
  assert.equal(calendarEventTitle({ ...jane, services: ["Commercial video"] }), "Jane Doe - CV");
  assert.equal(
    calendarEventTitle({
      ...jane,
      services: ["Real Estate · Photography", "Real Estate · Video"],
      notes: "gate code 1234",
    }),
    "Jane Doe - P V (gate code 1234)",
  );
  assert.equal(
    calendarEventTitle({ ...jane, services: ["Real Estate · Zillow 360"] }),
    "Jane Doe - 360",
  );
  const titled = calendarEventTitle({
    ...jane,
    services: ["Construction · Photography", "Construction · Video", "Commercial video"],
  });
  assert.equal(titled, "Jane Doe - P V CV");
  assert.doesNotMatch(titled, /Real Estate|Construction/);
  const copy = calendarEventCopy({
    ...jane,
    services: ["Real Estate · Photography", "Real Estate · Video"],
    notes: "gate code 1234",
  });
  assert.equal(copy.summary, "Jane Doe - P V (gate code 1234)");
  assert.match(copy.description, /Services: Real Estate · Photography, Real Estate · Video/);
});
