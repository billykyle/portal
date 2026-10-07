import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { prerender } from "react-dom/static";
import { AdminHeader } from "./admin-header";
import { ClientHeader } from "./client-header";

const HAMBURGER_BAR = /stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M1 (?:1|6|11)h16"/g;

/** Headers await the maintenance notice, so static markup has to wait for that render. */
async function markup(node: ReactNode) {
  const { prelude } = await prerender(node);
  const reader = prelude.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value) chunks.push(next.value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

test("signed-in headers use the hamburger menu and keep the centered logo clear", async () => {
  const client = await markup(createElement(ClientHeader));
  assert.match(client, /aria-label="Open menu"/);
  assert.match(client, /aria-expanded="false"/);
  assert.equal(client.match(HAMBURGER_BAR)?.length, 3);
  assert.doesNotMatch(client, /size-\[5px\] rounded-full/);
  assert.match(client, /href="\/account"/);
  assert.match(client, />Account</);
  assert.doesNotMatch(client, />Home</);
  assert.doesNotMatch(client, />Sign out</);
  assert.match(client, /absolute inset-0 flex items-center justify-center/);
  assert.match(client, /<svg[^>]*aria-label="Billy Kyle"/);
  assert.doesNotMatch(client, /bk-logo/);

  const withBack = await markup(
    createElement(ClientHeader, { backHref: "/scheduling", backLabel: "Address" }),
  );
  assert.match(withBack, /href="\/scheduling"/);
  assert.match(withBack, />Address</);
  assert.match(withBack, /aria-label="Open menu"/);

  const admin = await markup(createElement(AdminHeader));
  assert.match(admin, /aria-label="Open menu"/);
  assert.equal(admin.match(HAMBURGER_BAR)?.length, 3);
  assert.doesNotMatch(admin, /size-\[5px\] rounded-full/);
  assert.match(admin, />Sign out</);
  assert.doesNotMatch(admin, /href="\/account"/);
  assert.doesNotMatch(admin, />Clients<|>Bookings<|>Client<|>Address<|>Back</);
});
