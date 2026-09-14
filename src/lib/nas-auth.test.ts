import assert from "node:assert/strict";
import { test } from "node:test";
import { isNasAuthError } from "./nas-auth";

test("treats a missing UGOS share cookie as auth", () => {
  assert.equal(
    isNasAuthError(new Error('NAS thumbnail failed: {"code":1005,"debug":"http: named cookie not present"}')),
    true,
  );
  assert.equal(isNasAuthError(new Error("NAS share cookie is missing.")), true);
  assert.equal(isNasAuthError(new Error("NAS share verify failed.")), true);
});

test("does not rotate the share cookie on a generic thumbnail failure", () => {
  assert.equal(isNasAuthError(new Error("NAS thumbnail failed: file not found")), false);
  assert.equal(isNasAuthError(new Error("NAS download failed: timeout")), false);
  assert.equal(isNasAuthError(new Error("NAS share is not configured.")), false);
});
