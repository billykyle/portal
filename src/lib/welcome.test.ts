import assert from "node:assert/strict";
import { test } from "node:test";
import { welcomeClientLabel } from "./welcome";

test("includes the client display name", () => {
  assert.equal(welcomeClientLabel("Whitfield"), "Welcome, Whitfield");
  assert.equal(welcomeClientLabel("  Sam Lepore  "), "Welcome, Sam Lepore");
});

test("omits the comma when the name is missing", () => {
  assert.equal(welcomeClientLabel(""), "Welcome");
  assert.equal(welcomeClientLabel("   "), "Welcome");
  assert.equal(welcomeClientLabel(null), "Welcome");
  assert.equal(welcomeClientLabel(undefined), "Welcome");
});
