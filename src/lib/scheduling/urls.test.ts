import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_CONFIRMED, CLIENT_SCHEDULING_TIMES } from "../routes";
import { schedulingBookHref, schedulingConfirmedHref, schedulingTimesHref } from "./urls";

test("book and times hrefs keep a single address field plus services", () => {
  assert.equal(schedulingBookHref(), CLIENT_SCHEDULING);
  assert.equal(
    schedulingTimesHref({
      address: "12 Wood View Drive, Princeton, NJ, USA",
      placeId: "ChIJ123",
      services: ["Real Estate · Photography", "Construction · Video"],
      notes: "Lockbox on the porch",
    }),
    `${CLIENT_SCHEDULING_TIMES}?address=12+Wood+View+Drive%2C+Princeton%2C+NJ%2C+USA&placeId=ChIJ123&service=Real+Estate+%C2%B7+Photography&service=Construction+%C2%B7+Video&notes=Lockbox+on+the+porch`,
  );
  assert.equal(
    schedulingConfirmedHref("11111111-1111-4111-8111-111111111111"),
    `${CLIENT_SCHEDULING_CONFIRMED}/11111111-1111-4111-8111-111111111111`,
  );
  assert.equal(
    schedulingConfirmedHref("11111111-1111-4111-8111-111111111111", { updated: true }),
    `${CLIENT_SCHEDULING_CONFIRMED}/11111111-1111-4111-8111-111111111111?updated=1`,
  );
  assert.equal(
    schedulingConfirmedHref("11111111-1111-4111-8111-111111111111", {
      calendar: "failed",
      email: "failed",
    }),
    `${CLIENT_SCHEDULING_CONFIRMED}/11111111-1111-4111-8111-111111111111?calendar=failed&email=failed`,
  );
  assert.equal(
    schedulingTimesHref({
      address: "12 Wood View Drive, Princeton, NJ, USA",
      services: ["Real Estate · Photography"],
      error: "Pick a time.",
    }),
    `${CLIENT_SCHEDULING_TIMES}?address=12+Wood+View+Drive%2C+Princeton%2C+NJ%2C+USA&service=Real+Estate+%C2%B7+Photography&error=Pick+a+time.`,
  );
  assert.equal(
    schedulingBookHref({
      modify: "11111111-1111-4111-8111-111111111111",
      address: "12 Wood View Drive, Princeton, NJ, USA",
      services: ["Real Estate · Photography"],
      notes: "Lockbox",
    }),
    `${CLIENT_SCHEDULING}?address=12+Wood+View+Drive%2C+Princeton%2C+NJ%2C+USA&service=Real+Estate+%C2%B7+Photography&notes=Lockbox&modify=11111111-1111-4111-8111-111111111111`,
  );
});
