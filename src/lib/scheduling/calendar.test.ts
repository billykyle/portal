import assert from "node:assert/strict";
import { test } from "node:test";
import { collectFreeBusyIntervals } from "./calendar";
import {
  PERSONAL_CALENDAR_ID,
  WORK_CALENDAR_ID,
  isUsHolidayCalendar,
  parseCalendarIds,
  readCalendarCredentials,
  readCalendarIds,
} from "./config";

const WORK = WORK_CALENDAR_ID;
const PERSONAL = PERSONAL_CALENDAR_ID;
const HOLIDAY = "en.usa#holiday@group.v.calendar.google.com";

test("locked availability calendars are work + personal emails", () => {
  assert.equal(WORK, "billy@atmosimagery.com");
  assert.equal(PERSONAL, "bkyle015@gmail.com");
});

test("parseCalendarIds prefers a comma list and drops US Holidays", () => {
  assert.deepEqual(parseCalendarIds(`${WORK}, ${PERSONAL}, ${HOLIDAY}`), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds(`${WORK}\n${PERSONAL}`), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds([WORK, WORK, PERSONAL]), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds(HOLIDAY), []);
  assert.equal(isUsHolidayCalendar(HOLIDAY), true);
  assert.equal(isUsHolidayCalendar(WORK), false);
});

test("readCalendarIds prefers GOOGLE_CALENDAR_IDS over singular GOOGLE_CALENDAR_ID", () => {
  const previous = {
    GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  };
  process.env.GOOGLE_CALENDAR_IDS = `${WORK},${PERSONAL},${HOLIDAY}`;
  process.env.GOOGLE_CALENDAR_ID = "someone-else@example.com";
  assert.deepEqual(readCalendarIds(), [WORK, PERSONAL]);

  delete process.env.GOOGLE_CALENDAR_IDS;
  process.env.GOOGLE_CALENDAR_ID = WORK;
  assert.deepEqual(readCalendarIds(), [WORK]);

  restoreEnv(previous);
});

test("readCalendarCredentials needs at least one real calendar plus a service account", () => {
  const previous = {
    GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  };
  delete process.env.GOOGLE_CALENDAR_IDS;
  delete process.env.GOOGLE_CALENDAR_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
  assert.equal(readCalendarCredentials(), null);

  process.env.GOOGLE_CALENDAR_IDS = `${WORK},${PERSONAL}`;
  const creds = readCalendarCredentials();
  assert.ok(creds);
  assert.deepEqual(creds.calendarIds, [WORK, PERSONAL]);
  assert.equal(creds.writeCalendarId, WORK);

  restoreEnv(previous);
});

test("collectFreeBusyIntervals unions both calendars and fails closed", () => {
  const workBusy = { start: "2026-09-21T13:00:00.000Z", end: "2026-09-21T14:00:00.000Z" };
  const personalBusy = { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T19:00:00.000Z" };
  const blocks = collectFreeBusyIntervals(
    {
      [WORK]: { busy: [workBusy] },
      [PERSONAL]: { busy: [personalBusy] },
    },
    [WORK, PERSONAL],
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.start.toISOString(), workBusy.start);
  assert.equal(blocks[1]?.start.toISOString(), personalBusy.start);

  assert.throws(
    () => collectFreeBusyIntervals({ [WORK]: { busy: [] } }, [WORK, PERSONAL]),
    /bkyle015@gmail.com/,
  );
  assert.throws(
    () =>
      collectFreeBusyIntervals(
        {
          [WORK]: { busy: [] },
          [PERSONAL]: { errors: [{ reason: "notFound" }] },
        },
        [WORK, PERSONAL],
      ),
    /failed for bkyle015@gmail.com/,
  );
});

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
