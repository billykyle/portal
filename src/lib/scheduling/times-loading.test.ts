import assert from "node:assert/strict";
import { test } from "node:test";
import { TIMES_LOADING_COPY } from "./times-loading";

test("times loading copy is the locked sentence", () => {
  assert.equal(TIMES_LOADING_COPY, "Loading your available times");
});
