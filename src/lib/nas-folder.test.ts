import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyNasShootIdentity,
  classifyClientChildren,
  clientFolderRelPath,
  parseShootFolderName,
  pendingClientEmail,
} from "./nas-folder";

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
  assert.equal(
    clientFolderRelPath("Client Name", "2026.09.29 - Some Job", "Construction"),
    "Client Name/Construction/2026.09.29 - Some Job",
  );
});

const STILLS = ["Final", "Photos"];

test("a dated folder at the client root is a shoot with no category", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [{ name: "2026.09.29 - 7 Michigan Avenue" }],
  });
  assert.deepEqual(plan.warnings, []);
  assert.deepEqual(plan.shoots, [
    {
      shotDate: "2026-09-29",
      address: "7 Michigan Avenue",
      folderName: "2026.09.29 - 7 Michigan Avenue",
      categoryFolder: null,
      nasRelativePath: "Client Name/2026.09.29 - 7 Michigan Avenue",
    },
  ]);
});

test("a category folder's dated children are shoots in that category", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [
      { name: "2026.09.29 - 7 Michigan Avenue" },
      {
        name: "Listing Photography",
        inner: [{ name: "2026.09.29 - Other Job" }, { name: "Notes" }],
      },
      {
        name: "Construction",
        inner: [{ name: "2026.09.29 - Some Job" }],
      },
    ],
  });
  assert.deepEqual(plan.warnings, []);
  assert.deepEqual(
    plan.shoots.map((shoot) => ({ path: shoot.nasRelativePath, category: shoot.categoryFolder })),
    [
      { path: "Client Name/2026.09.29 - 7 Michigan Avenue", category: null },
      { path: "Client Name/Listing Photography/2026.09.29 - Other Job", category: "Listing Photography" },
      { path: "Client Name/Construction/2026.09.29 - Some Job", category: "Construction" },
    ],
  );
});

test("stills-named folders under the client are not categories", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: ["Final", "Photos", "Selects"],
    children: [
      { name: "Photos", inner: [{ name: "2026.09.29 - Hidden" }] },
      { name: "Final" },
      { name: "Floor Plans" },
      { name: "Video" },
      { name: "Raw Video" },
      { name: "Selects", inner: [{ name: "2026.09.29 - Also Hidden" }] },
      { name: "2026.09.29 - 7 Michigan Avenue" },
    ],
  });
  assert.deepEqual(plan.warnings, []);
  assert.equal(plan.shoots.length, 1);
  assert.equal(plan.shoots[0]?.address, "7 Michigan Avenue");
  assert.equal(plan.shoots[0]?.categoryFolder, null);
});

test("an empty category folder is ignored", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [
      { name: "Construction", inner: [] },
      { name: "Marketing Assets" },
    ],
  });
  assert.deepEqual(plan.shoots, []);
  assert.deepEqual(plan.warnings, []);
});

test("a stray folder that holds no shoots still warns", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [{ name: "Miscellaneous", inner: [{ name: "readme" }] }],
  });
  assert.deepEqual(plan.shoots, []);
  assert.deepEqual(plan.warnings, [
    'Skipped Client Name/Miscellaneous — expected "{date} - {address}".',
  ]);
});

test("the same date and address in two folders is one shoot and the later folder wins", () => {
  const plan = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [
      { name: "Construction", inner: [{ name: "2026.09.29 - Some Job" }] },
      { name: "Listing Photography", inner: [{ name: "2026.09.29 - Some Job" }] },
    ],
  });
  assert.equal(plan.shoots.length, 1);
  assert.equal(plan.shoots[0]?.categoryFolder, "Listing Photography");
  assert.equal(
    plan.shoots[0]?.nasRelativePath,
    "Client Name/Listing Photography/2026.09.29 - Some Job",
  );
});

test("moving a shoot between the client root and a category updates one row", () => {
  const clientId = "client-1";
  const root = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [{ name: "2026.09.29 - Some Job" }],
  }).shoots[0];
  assert.ok(root);
  const created = applyNasShootIdentity(
    [],
    { clientId, ...root },
    "shoot-1",
  );
  assert.equal(created.length, 1);
  assert.equal(created[0]?.categoryFolder, null);
  assert.equal(created[0]?.nasRelativePath, "Client Name/2026.09.29 - Some Job");

  const nested = classifyClientChildren({
    clientName: "Client Name",
    stillsFolders: STILLS,
    children: [{ name: "Construction", inner: [{ name: "2026.09.29 - Some Job" }] }],
  }).shoots[0];
  assert.ok(nested);
  const moved = applyNasShootIdentity(created, { clientId, ...nested }, "shoot-2");
  assert.equal(moved.length, 1);
  assert.equal(moved[0]?.id, "shoot-1");
  assert.equal(moved[0]?.categoryFolder, "Construction");
  assert.equal(moved[0]?.nasRelativePath, "Client Name/Construction/2026.09.29 - Some Job");

  const back = applyNasShootIdentity(moved, { clientId, ...root }, "shoot-3");
  assert.equal(back.length, 1);
  assert.equal(back[0]?.id, "shoot-1");
  assert.equal(back[0]?.categoryFolder, null);
  assert.equal(back[0]?.nasRelativePath, "Client Name/2026.09.29 - Some Job");
});
