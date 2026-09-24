import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminHeader } from "./admin-header";
import { ClientHeader } from "./client-header";

const HAMBURGER_BAR = /stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M1 (?:1|6|11)h16"/g;

test("signed-in headers use the hamburger menu and keep the centered logo clear", () => {
  const client = renderToStaticMarkup(createElement(ClientHeader));
  assert.match(client, /aria-label="Open menu"/);
  assert.match(client, /aria-expanded="false"/);
  assert.equal(client.match(HAMBURGER_BAR)?.length, 3);
  assert.doesNotMatch(client, /size-\[5px\] rounded-full/);
  assert.match(client, /href="\/account"/);
  assert.match(client, />Account</);
  assert.doesNotMatch(client, />Home</);
  assert.doesNotMatch(client, />Sign out</);
  assert.match(client, /absolute inset-0 flex items-center justify-center/);

  const withBack = renderToStaticMarkup(
    createElement(ClientHeader, { backHref: "/scheduling", backLabel: "Address" }),
  );
  assert.match(withBack, /href="\/scheduling"/);
  assert.match(withBack, />Address</);
  assert.match(withBack, /aria-label="Open menu"/);

  const admin = renderToStaticMarkup(createElement(AdminHeader, { backHref: "/admin/clients/abc", backLabel: "Client" }));
  assert.match(admin, /aria-label="Open menu"/);
  assert.equal(admin.match(HAMBURGER_BAR)?.length, 3);
  assert.doesNotMatch(admin, /size-\[5px\] rounded-full/);
  assert.match(admin, /href="\/admin\/clients\/abc"/);
  assert.match(admin, />Client</);
  assert.match(admin, />Sign out</);
  assert.doesNotMatch(admin, /href="\/account"/);
});
