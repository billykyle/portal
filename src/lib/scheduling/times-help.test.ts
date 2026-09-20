import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TIMES_HELP_CONTACT_EMAIL,
  TIMES_HELP_CONTACT_LABEL,
  TIMES_HELP_COPY,
} from "./times-help";

test("times help copy is the locked sentence", () => {
  assert.equal(
    TIMES_HELP_COPY,
    "If you don’t see an available time that works for your schedule, please contact me and we will try to make it work!",
  );
  assert.equal(TIMES_HELP_CONTACT_LABEL, "contact me");
  assert.equal(TIMES_HELP_CONTACT_EMAIL, "billy@billyhere.com");
  assert.ok(TIMES_HELP_COPY.includes(TIMES_HELP_CONTACT_LABEL));
});
