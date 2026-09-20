import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimesHelpNote } from "../../components/times-help-note";
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

test("times help note renders the locked sentence with a mailto", () => {
  const html = renderToStaticMarkup(createElement(TimesHelpNote));
  assert.match(html, /If you don’t see an available time that works for your schedule, please /);
  assert.match(html, new RegExp(`href="mailto:${TIMES_HELP_CONTACT_EMAIL}"`));
  assert.match(html, new RegExp(`>${TIMES_HELP_CONTACT_LABEL}<`));
  assert.match(html, / and we will try to make it work!/);
});
