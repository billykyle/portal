import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminClientDirectory } from "../../components/admin-client-directory";
import { CLIENT_SORT_LABELS, CLIENT_SORTS } from "./client-sort";

const rows = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    inviteCode: "BK00010",
    displayName: "Sam Lepore",
    company: "Lepore Realty",
    primaryEmail: "sam@example.com",
    memberCount: 2,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    inviteCode: "BK00004",
    displayName: "Justin Heath",
    company: null,
    primaryEmail: "justin.heath@pending.local",
    memberCount: 0,
  },
];

test("desktop clients table shows a Members count between email and the chevron", () => {
  const html = renderToStaticMarkup(
    createElement(AdminClientDirectory, {
      rowsEmpty: false,
      visible: rows,
      query: "",
      searchAction: "/admin/clients",
      showSort: false,
    }),
  );
  const code = html.indexOf(">Code<");
  const name = html.indexOf(">Name<");
  const company = html.indexOf(">Company<");
  const email = html.indexOf(">Email<");
  const members = html.indexOf(">Members<");
  assert.ok(code >= 0 && name > code && company > name && email > company && members > email);
  assert.match(html, /5\.5rem_auto/);
  const zeroRow = html.indexOf("justin.heath@pending.local");
  const zeroCount = html.indexOf(">0<", zeroRow);
  const zeroChevron = html.indexOf("<svg", zeroCount);
  assert.ok(zeroRow >= 0 && zeroCount > zeroRow && zeroChevron > zeroCount);
  const twoRow = html.indexOf("sam@example.com");
  assert.ok(html.indexOf(">2<", twoRow) > twoRow);
  assert.match(html, /Members 0/);
  assert.match(html, /Members 2/);
});

test("search and sort share one row, and search is the wider control", () => {
  const directory = readFileSync("src/components/admin-client-directory.tsx", "utf8");
  const sort = readFileSync("src/components/client-sort-select.tsx", "utf8");
  assert.match(directory, /flex items-center gap-3/);
  assert.match(directory, /flex-\[1\.6\]/);
  assert.doesNotMatch(directory, /flex-col/);
  assert.match(sort, /min-w-0 flex-1/);
  assert.match(sort, /lg:w-52/);
});

test("member count is not a sort option", () => {
  assert.equal(
    CLIENT_SORTS.some((sort) => /member/i.test(sort)),
    false,
  );
  assert.equal(
    Object.values(CLIENT_SORT_LABELS).some((label) => /member/i.test(label)),
    false,
  );
  assert.deepEqual(
    [...CLIENT_SORTS],
    ["code-desc", "code-asc", "name-asc", "name-desc", "company", "newest", "oldest", "shoots"],
  );
});
