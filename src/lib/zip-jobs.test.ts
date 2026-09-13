import assert from "node:assert/strict";
import { test } from "node:test";
import { isZipJobId } from "./zip-jobs";

test("accepts a UUID zip job id", () => {
  assert.equal(isZipJobId("2c1d5a0e-3b4f-4a21-9c8d-7e6f5a4b3c2d"), true);
  assert.equal(isZipJobId("not-a-job"), false);
  assert.equal(isZipJobId(""), false);
});
