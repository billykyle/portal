import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminHeader } from "./admin-header";
import { ClientHeader } from "./client-header";

test("signed-in headers use the dot menu and keep the centered logo clear", () => {
  const client = renderToStaticMarkup(createElement(ClientHeader));
  assert.match(client, /aria-label="Open menu"/);
  assert.match(client, /aria-expanded="false"/);
  assert.equal(client.match(/size-\[5px\] rounded-full/g)?.length, 3);
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
  assert.match(admin, /href="\/admin\/clients\/abc"/);
  assert.match(admin, />Client</);
  assert.match(admin, />Sign out</);
  assert.doesNotMatch(admin, /href="\/account"/);
});
