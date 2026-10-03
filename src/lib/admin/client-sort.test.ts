import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CLIENT_SORT_COOKIE,
  CLIENT_SORT_LABELS,
  CLIENT_SORTS,
  clientSortCookie,
  compareClients,
  parseClientSort,
  readClientSortArgument,
  sortClients,
  type SortableClient,
} from "./client-sort";

type Row = SortableClient & { id: string };

const rows: Row[] = [
  {
    id: "1",
    displayName: "mira",
    company: "Zenith",
    inviteCode: "BK00003",
    createdAt: "2026-01-02T00:00:00.000Z",
    shootCount: 1,
  },
  {
    id: "2",
    displayName: "Mira",
    company: null,
    inviteCode: "BK00001",
    createdAt: "2026-03-01T00:00:00.000Z",
    shootCount: 4,
  },
  {
    id: "3",
    displayName: "adam",
    company: "  ",
    inviteCode: "BK00010",
    createdAt: "2026-02-01T00:00:00.000Z",
    shootCount: 4,
  },
  {
    id: "4",
    displayName: "Adam",
    company: "acme",
    inviteCode: "BK00002",
    createdAt: "2026-02-01T00:00:00.000Z",
    shootCount: 0,
  },
  {
    id: "5",
    displayName: "bea",
    company: "Acme",
    inviteCode: "NOPE",
    createdAt: "2026-04-01T00:00:00.000Z",
    shootCount: 2,
  },
];

function ids(sort: Parameters<typeof sortClients>[1]) {
  return sortClients(rows, sort).map((row) => row.id);
}

test("client sorts are case-insensitive and stable", () => {
  assert.deepEqual(ids("name-asc"), ["3", "4", "5", "1", "2"]);
  assert.deepEqual(ids("name-desc"), ["1", "2", "5", "3", "4"]);
  assert.deepEqual(ids("company"), ["4", "5", "1", "2", "3"]);
  assert.deepEqual(ids("newest"), ["5", "2", "3", "4", "1"]);
  assert.deepEqual(ids("oldest"), ["1", "3", "4", "2", "5"]);
  assert.deepEqual(ids("shoots"), ["2", "3", "5", "1", "4"]);
  assert.deepEqual(ids("code-asc"), ["2", "4", "1", "3", "5"]);
  assert.deepEqual(ids("code-desc"), ["3", "1", "4", "2", "5"]);
  assert.equal(compareClients("name-asc", rows[2], rows[3]), 0);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["1", "2", "3", "4", "5"],
  );
});

test("missing or unknown sort falls back to highest invite code", () => {
  assert.equal(parseClientSort(undefined), "code-desc");
  assert.equal(parseClientSort(""), "code-desc");
  assert.equal(parseClientSort("not-a-sort"), "code-desc");
  assert.equal(parseClientSort("code"), "code-asc");
  assert.equal(parseClientSort("shoots"), "shoots");
  assert.equal(parseClientSort(encodeURIComponent("name-desc")), "name-desc");
});

test("agent sort argument is optional and rejects unknown values", () => {
  assert.deepEqual(readClientSortArgument(undefined), { ok: true });
  assert.deepEqual(readClientSortArgument(null), { ok: true });
  assert.deepEqual(readClientSortArgument(""), { ok: true });
  assert.deepEqual(readClientSortArgument("code"), { ok: true, sort: "code-asc" });
  assert.deepEqual(readClientSortArgument("code-desc"), { ok: true, sort: "code-desc" });
  const invalid = readClientSortArgument("alpha");
  assert.equal(invalid.ok, false);
});

test("sort cookie stays off the query string", () => {
  const cookie = clientSortCookie("company", true);
  assert.match(cookie, new RegExp(`^${CLIENT_SORT_COOKIE}=company;`));
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(clientSortCookie("newest"), /Secure/);
  const page = readFileSync("src/app/admin/clients/page.tsx", "utf8");
  const home = readFileSync("src/app/admin/home/clients/page.tsx", "utf8");
  const directory = readFileSync("src/components/admin-client-directory.tsx", "utf8");
  assert.match(page, /sortClients\(/);
  assert.match(home, /sortClients\(/);
  assert.match(page, /parseClientSort\(cookieStore\.get\(CLIENT_SORT_COOKIE\)/);
  assert.match(home, /parseClientSort\(cookieStore\.get\(CLIENT_SORT_COOKIE\)/);
  assert.match(directory, /ClientSortSelect/);
  assert.doesNotMatch(page, /name=["']sort["']/);
  assert.doesNotMatch(home, /name=["']sort["']/);
  assert.doesNotMatch(directory, /name=["']sort["']/);
  assert.doesNotMatch(page, /searchParams\.sort|params\.set\(["']sort["']\)/);
  assert.doesNotMatch(home, /searchParams\.sort|params\.set\(["']sort["']\)/);
});

test("sort control lists every option and stores the choice in a cookie", () => {
  assert.deepEqual(CLIENT_SORTS.map((sort) => CLIENT_SORT_LABELS[sort]), [
    "Code high to low",
    "Code low to high",
    "Name A to Z",
    "Name Z to A",
    "Company A to Z",
    "Newest added",
    "Oldest added",
    "Most shoots",
  ]);
  const source = readFileSync("src/components/client-sort-select.tsx", "utf8");
  assert.match(source, /CLIENT_SORTS\.map/);
  assert.match(source, /CLIENT_SORT_LABELS\[sort\]/);
  assert.match(source, /id="client-sort"/);
  assert.match(source, /Sort clients/);
  assert.match(source, /clientSortCookie/);
  assert.doesNotMatch(source, /searchParams|router\.push|URLSearchParams/);
});
