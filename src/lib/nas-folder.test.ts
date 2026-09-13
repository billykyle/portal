import assert from "node:assert/strict";
import { test } from "node:test";
import { clientFolderRelPath, parseShootFolderName, pendingClientEmail } from "./nas-folder";

test("parses dotted NAS shoot folders", () => {
  const parsed = parseShootFolderName("2026.09.04 - 12 Wood View Drive");
  assert.deepEqual(parsed, {
    shotDate: "2026-09-04",
    address: "12 Wood View Drive",
    folderName: "2026.09.04 - 12 Wood View Drive",
  });
});

test("parses ISO-dashed shoot folders", () => {
  const parsed = parseShootFolderName("2026-03-18 - 412 West 12th Street, Unit 6B");
  assert.equal(parsed?.shotDate, "2026-03-18");
  assert.equal(parsed?.address, "412 West 12th Street, Unit 6B");
});

test("rejects folders that are not date + address", () => {
  assert.equal(parseShootFolderName("Final"), null);
  assert.equal(parseShootFolderName("Sam Lepore"), null);
  assert.equal(parseShootFolderName("2026.13.40 - Bad"), null);
});

test("builds a pending email and relative path", () => {
  assert.equal(pendingClientEmail("Sam Lepore"), "sam.lepore@pending.local");
  assert.equal(
    clientFolderRelPath("Sam Lepore", "2026.09.04 - 12 Wood View Drive"),
    "Sam Lepore/2026.09.04 - 12 Wood View Drive",
  );
});
