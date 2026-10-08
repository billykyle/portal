import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignupForm } from "./signup-form";

const PRIMARY_CONTACT = {
  displayName: "Colleen Hadden",
  firstName: "Colleen",
  lastName: "Hadden",
  company: "Compass",
  phone: "215-555-0199",
  email: "Colleen.Hadden@compass.com",
  placeholder: "colleen.hadden@pending.local",
};

function inputTag(html: string, id: string) {
  const match = html.match(new RegExp(`<input\\b(?=[^>]*\\bid="${id}")[^>]*>`));
  assert.ok(match, `missing input ${id}`);
  return match[0];
}

test("create account fields start blank and keep standard autocomplete", () => {
  const html = renderToStaticMarkup(createElement(SignupForm, { inviteCode: "BK00042" }));

  const fields: Array<{ id: string; label: string; autoComplete: string; type?: string }> = [
    { id: "firstName", label: "First name", autoComplete: "given-name" },
    { id: "lastName", label: "Last name", autoComplete: "family-name" },
    { id: "companyName", label: "Company name", autoComplete: "organization" },
    { id: "phone", label: "Phone number", autoComplete: "tel", type: "tel" },
    { id: "email", label: "Email", autoComplete: "email", type: "email" },
    { id: "password", label: "Password", autoComplete: "new-password", type: "password" },
    { id: "confirm", label: "Confirm password", autoComplete: "new-password", type: "password" },
  ];

  for (const field of fields) {
    assert.match(html, new RegExp(`>${field.label}<`));
    const tag = inputTag(html, field.id);
    assert.match(tag, /value=""/);
    assert.doesNotMatch(tag, /value="[^"]+"/);
    assert.match(tag, new RegExp(`autocomplete="${field.autoComplete}"`, "i"));
    assert.doesNotMatch(tag, /readonly/i);
    if (field.type) assert.match(tag, new RegExp(`type="${field.type}"`));
    assert.match(tag, /required/);
  }

  assert.match(html, /<input type="hidden" name="inviteCode" value="BK00042"\/>/);
  assert.match(html, /Create account/);
  assert.doesNotMatch(html, /autocomplete="off"/);

  for (const value of Object.values(PRIMARY_CONTACT)) {
    assert.equal(html.includes(value), false);
  }
  assert.doesNotMatch(html, /@pending\.local/);
});

test("signup page does not copy the client record into the form", () => {
  const page = readFileSync("src/app/signup/page.tsx", "utf8");
  const form = readFileSync("src/components/forms/signup-form.tsx", "utf8");

  assert.match(page, /<SignupForm inviteCode=\{inviteCode\} \/>/);
  assert.match(page, /getInviteCookie/);
  assert.doesNotMatch(page, /defaultEmail|defaultCompany|emailLocked|primaryEmail|isPendingClientEmail|client\?\.company|client\.company/);
  assert.doesNotMatch(form, /defaultEmail|defaultCompany|emailLocked|primaryEmail|readOnly/);
});
