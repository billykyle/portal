import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPendingClientEmail,
  parseAccountProfile,
  parseLoginEmail,
  parsePasswordChange,
  parseSignupProfile,
  teammateDisplayName,
} from "./signup-fields";

test("signup profile requires first, last, company, phone, and email", () => {
  const missing = parseSignupProfile({
    firstName: "",
    lastName: "Kyle",
    companyName: "Atmos",
    phone: "6095550100",
    email: "billy@example.com",
  });
  assert.equal(missing.ok, false);

  const ok = parseSignupProfile({
    firstName: " Billy ",
    lastName: "Kyle",
    companyName: "Atmos Imagery",
    phone: "(609) 555-0100",
    email: "Billy@Example.com",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.firstName, "Billy");
    assert.equal(ok.value.lastName, "Kyle");
    assert.equal(ok.value.companyName, "Atmos Imagery");
    assert.equal(ok.value.phone, "(609) 555-0100");
    assert.equal(ok.value.email, "billy@example.com");
  }
});

test("short phone numbers are rejected", () => {
  const result = parseSignupProfile({
    firstName: "Billy",
    lastName: "Kyle",
    companyName: "Atmos",
    phone: "555-0100",
    email: "billy@example.com",
  });
  assert.equal(result.ok, false);
});

test("pending NAS emails are detected", () => {
  assert.equal(isPendingClientEmail("whitfield@pending.local"), true);
  assert.equal(isPendingClientEmail("billy@atmosimagery.com"), false);
});

test("login email is normalized and must include a domain", () => {
  const ok = parseLoginEmail(" Billy@Example.com ");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value, "billy@example.com");
  assert.equal(parseLoginEmail("not-an-email").ok, false);
  assert.equal(parseLoginEmail("a@b").ok, false);
  assert.equal(parseLoginEmail("user@localhost").ok, false);
});

test("account profile omits email and still requires name, company, and phone", () => {
  const missing = parseAccountProfile({
    firstName: "Billy",
    lastName: "Kyle",
    companyName: "",
    phone: "6095550100",
  });
  assert.equal(missing.ok, false);

  const ok = parseAccountProfile({
    firstName: " Billy ",
    lastName: "Kyle",
    companyName: "Atmos Imagery",
    phone: "(609) 555-0100",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.firstName, "Billy");
    assert.equal(ok.value.companyName, "Atmos Imagery");
  }
});

test("password change requires current, matching new, and a different password", () => {
  assert.equal(parsePasswordChange({ currentPassword: "", password: "newpass12", confirm: "newpass12" }).ok, false);
  assert.equal(
    parsePasswordChange({ currentPassword: "oldpass12", password: "short", confirm: "short" }).ok,
    false,
  );
  assert.equal(
    parsePasswordChange({ currentPassword: "oldpass12", password: "newpass12", confirm: "mismatch1" }).ok,
    false,
  );
  assert.equal(
    parsePasswordChange({ currentPassword: "samepass1", password: "samepass1", confirm: "samepass1" }).ok,
    false,
  );
  const ok = parsePasswordChange({
    currentPassword: "oldpass12",
    password: "newpass12",
    confirm: "newpass12",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.password, "newpass12");
  }
});

test("teammate display name falls back to email", () => {
  assert.equal(
    teammateDisplayName({ firstName: "Billy", lastName: "Kyle", email: "b@example.com" }),
    "Billy Kyle",
  );
  assert.equal(teammateDisplayName({ firstName: null, lastName: null, email: "b@example.com" }), "b@example.com");
});
