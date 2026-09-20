import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "../routes";
import { schedulingBookHref, schedulingTimesHref } from "./urls";

test("book and times hrefs keep a single address field plus services", () => {
  assert.equal(schedulingBookHref(), CLIENT_SCHEDULING);
  assert.equal(
    schedulingTimesHref({
      address: "12 Wood View Drive, Princeton, NJ, USA",
      placeId: "ChIJ123",
      services: ["Real Estate · Photography", "Construction · Video"],
    }),
    `${CLIENT_SCHEDULING_TIMES}?address=12+Wood+View+Drive%2C+Princeton%2C+NJ%2C+USA&placeId=ChIJ123&service=Real+Estate+%C2%B7+Photography&service=Construction+%C2%B7+Video`,
  );
  assert.equal(
    schedulingBookHref({ booked: "1" }),
    `${CLIENT_SCHEDULING}?booked=1`,
  );
});
