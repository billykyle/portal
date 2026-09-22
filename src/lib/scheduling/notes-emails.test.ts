import assert from "node:assert/strict";
import { test } from "node:test";
import { emailsInNotes } from "./notes-emails";

test("notes emails are parsed, deduped, and the booker is excluded", () => {
  const notes = [
    "Please cc: Jane@Acme.com",
    "also send to bob@acme.com and bob@acme.com",
    "copy <sue@foo.co.uk>",
    "and sam@example.com.",
  ].join("\n");

  assert.deepEqual(emailsInNotes(notes, ["jane@acme.com"]), [
    "bob@acme.com",
    "sue@foo.co.uk",
    "sam@example.com",
  ]);
});

test("invalid note tokens are ignored", () => {
  const notes = "not-an-email a@b user@localhost @missing.com cc: ok+shoot@example.com";
  assert.deepEqual(emailsInNotes(notes, []), ["ok+shoot@example.com"]);
});

test("empty notes yield no copy addresses", () => {
  assert.deepEqual(emailsInNotes(null, ["sam@example.com"]), []);
  assert.deepEqual(emailsInNotes("   ", ["sam@example.com"]), []);
  assert.deepEqual(emailsInNotes("Park in the driveway.", ["sam@example.com"]), []);
});
