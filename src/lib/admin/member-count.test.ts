import assert from "node:assert/strict";
import { test } from "node:test";
import { signedUpMemberCount } from "./member-count";

test("member count is signed-up logins and zero when nobody has signed up", () => {
  assert.equal(signedUpMemberCount(undefined), 0);
  assert.equal(signedUpMemberCount(null), 0);
  assert.equal(signedUpMemberCount([]), 0);
  assert.equal(
    signedUpMemberCount([
      { email: "sam@example.com" },
      { email: "pat@example.com" },
    ]),
    2,
  );
  assert.equal(
    signedUpMemberCount([
      { email: "sam.lepore@pending.local" },
      { email: "  Office@Pending.Local " },
      { email: "pat@example.com" },
    ]),
    1,
  );
});
