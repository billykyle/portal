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
    "Billy Kyle - Real Estate · Photography (1234)",
  );
  assert.equal(
    calendarEventTitle({
      firstName: "Billy",
      lastName: "Kyle",
      address: "644 Plumrun Dr",
      services: [photo, aerial],
      accessCodes: "1234",
    }),
    "Billy Kyle - Real Estate · Photography, Real Estate · Aerial Photos",
  );
  assert.equal(
    calendarEventTitle({
      displayName: "Sam Lepore",
      address: "12 Wood View Drive",
      services: [photo],
      notes: "1234",
    }),
    "Sam Lepore - Real Estate · Photography (1234)",
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
    "Billy Kyle - Real Estate · Photography (Park in the driveway.)",
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
  assert.equal(copy.summary, "Sam Lepore - Real Estate · Photography");
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
});
