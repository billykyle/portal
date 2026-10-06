import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShootDetail, type ShootMedia } from "@/components/shoot-detail";
import {
  SELECTION_ID_LIMIT,
  authorizeZipDownload,
  filesForSelection,
  parseSelectionIdList,
  readSelectionIds,
  selectionCountLabel,
  selectionDownloadKind,
  toggleSelectedId,
} from "./shoot-selection";

const HOME = "11111111-1111-4111-8111-111111111111";
const EXTRA = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const SHOOT = "44444444-4444-4444-8444-444444444444";
const FILE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FILE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const shoot = { id: SHOOT, clientId: EXTRA, publicToken: "share-token" };

test("selection toggles, selects every id, and clears", () => {
  const once = toggleSelectedId(new Set(), FILE_A);
  assert.deepEqual([...once], [FILE_A]);
  const twice = toggleSelectedId(once, FILE_A);
  assert.equal(twice.size, 0);
  const both = toggleSelectedId(toggleSelectedId(new Set(), FILE_A), FILE_B);
  assert.deepEqual([...both], [FILE_A, FILE_B]);
});

test("count label and download kind", () => {
  assert.equal(selectionCountLabel(0), "0 selected");
  assert.equal(selectionCountLabel(1), "1 selected");
  assert.equal(selectionCountLabel(12), "12 selected");
  assert.equal(selectionDownloadKind(0), "none");
  assert.equal(selectionDownloadKind(1), "file");
  assert.equal(selectionDownloadKind(2), "zip");
});

test("account zip allows admin, the current portal, and an extra BK code", () => {
  assert.deepEqual(
    authorizeZipDownload({
      kind: "account",
      admin: true,
      session: null,
      accessibleClientIds: [],
      shoot,
    }),
    { ok: true },
  );
  assert.deepEqual(
    authorizeZipDownload({
      kind: "account",
      admin: false,
      session: { userId: "user-1", clientId: EXTRA },
      accessibleClientIds: [],
      shoot,
    }),
    { ok: true },
  );
  assert.deepEqual(
    authorizeZipDownload({
      kind: "account",
      admin: false,
      session: { userId: "user-1", clientId: HOME },
      accessibleClientIds: [HOME, EXTRA],
      shoot,
    }),
    { ok: true },
  );
});

test("account zip refuses anonymous users and clients they cannot open", () => {
  const signedOut = authorizeZipDownload({
    kind: "account",
    admin: false,
    session: null,
    accessibleClientIds: [],
    shoot,
  });
  assert.deepEqual(signedOut, { ok: false, status: 401, error: "Sign in to download this shoot." });

  const stranger = authorizeZipDownload({
    kind: "account",
    admin: false,
    session: { userId: "user-1", clientId: HOME },
    accessibleClientIds: [HOME],
    shoot,
  });
  assert.equal(stranger.ok, false);
  if (!stranger.ok) assert.equal(stranger.status, 404);

  const missing = authorizeZipDownload({
    kind: "account",
    admin: true,
    session: null,
    accessibleClientIds: [],
    shoot: null,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);
});

test("share zip requires the shoot token", () => {
  assert.deepEqual(
    authorizeZipDownload({
      kind: "share",
      admin: false,
      session: null,
      accessibleClientIds: [],
      shoot,
      shareToken: "share-token",
    }),
    { ok: true },
  );
  const wrong = authorizeZipDownload({
    kind: "share",
    admin: false,
    session: { userId: "user-1", clientId: EXTRA },
    accessibleClientIds: [EXTRA],
    shoot,
    shareToken: "other-token",
  });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 404);
});

test("selection ids stay on this shoot, in request order", () => {
  const files = [
    { id: FILE_A, filename: "a.jpg" },
    { id: FILE_B, filename: "b.jpg" },
    { id: FILE_C, filename: "c.jpg" },
  ];
  assert.deepEqual(filesForSelection(files, [FILE_C, FILE_A]), {
    ok: true,
    files: [
      { id: FILE_C, filename: "c.jpg" },
      { id: FILE_A, filename: "a.jpg" },
    ],
  });
  const mixed = filesForSelection(files, [FILE_A, OTHER]);
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.equal(mixed.status, 404);
  const empty = filesForSelection(files, []);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.status, 400);
});

test("selection id lists drop blanks and duplicates and refuse anything else", () => {
  assert.deepEqual(parseSelectionIdList([` ${FILE_A} `, FILE_A, "", FILE_B]), {
    ok: true,
    ids: [FILE_A, FILE_B],
  });
  assert.deepEqual(parseSelectionIdList(`${FILE_A}, ${FILE_B}`), {
    ok: true,
    ids: [FILE_A, FILE_B],
  });
  assert.equal(parseSelectionIdList("not-a-file").ok, false);
  assert.equal(parseSelectionIdList([FILE_A, 12]).ok, false);
  assert.equal(parseSelectionIdList("").ok, false);
  const tooMany = Array.from({ length: SELECTION_ID_LIMIT + 1 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  assert.equal(parseSelectionIdList(tooMany).ok, false);
});

test("selection zip reads json and form ids", async () => {
  const json = await readSelectionIds(
    new Request("http://127.0.0.1/api/shoots/x/zip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [FILE_A, FILE_B] }),
    }),
  );
  assert.deepEqual(json, { ok: true, ids: [FILE_A, FILE_B] });

  const form = await readSelectionIds(
    new Request("http://127.0.0.1/api/s/tok/zip", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ids: `${FILE_B},${FILE_A}` }),
    }),
  );
  assert.deepEqual(form, { ok: true, ids: [FILE_B, FILE_A] });

  const missing = await readSelectionIds(
    new Request("http://127.0.0.1/api/shoots/x/zip", { method: "POST" }),
  );
  assert.equal(missing.ok, false);
});

test("zip routes authorize a selection before streaming it", () => {
  const account = readFileSync("src/app/api/shoots/[id]/zip/route.ts", "utf8");
  const share = readFileSync("src/app/api/s/[token]/zip/route.ts", "utf8");
  for (const source of [account, share]) {
    assert.match(source, /export async function POST/);
    assert.match(source, /authorizeZipDownload/);
    assert.match(source, /selectionZipResponse/);
    assert.match(source, /maxDuration = 300/);
  }
  assert.match(account, /listPortalsForUser/);
  assert.match(account, /kind: "account"/);
  assert.match(share, /kind: "share"/);
  assert.match(share, /shareToken: token/);
  assert.match(readFileSync("src/lib/selection-zip.ts", "utf8"), /filesForSelection/);
  assert.match(readFileSync("src/lib/shoot-zip.ts", "utf8"), /addReadStreamLazy/);
});

test("shoot pages keep the viewer and per-file download until Select is on", () => {
  const media: ShootMedia[] = [
    {
      id: FILE_A,
      url: "/photos/front.jpg",
      thumbUrl: "/thumbs/front.jpg",
      filename: "front.jpg",
      type: "photo",
    },
  ];
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/my-content/harbor",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04 - 12 Wood View Drive",
      zipUrl: "/api/shoots/shoot-1/zip",
      media,
    }),
  );
  assert.match(html, />Select</);
  assert.doesNotMatch(html, /Select all/);
  assert.doesNotMatch(html, /selected</);
  assert.match(html, /href="\/my-content\/harbor\?view=/);
  assert.match(html, /href="\/photos\/front\.jpg"/);
  assert.match(html, />Download</);
});
