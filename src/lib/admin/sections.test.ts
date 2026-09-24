import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSection } from "../../components/admin-section";
import { DeleteClientForm } from "../../components/forms/delete-client-form";
import { EditClientForm } from "../../components/forms/edit-client-form";
import { MintClientForm } from "../../components/forms/mint-client-form";
import {
  ADMIN_SECTIONS_COOKIE,
  adminSectionsCookie,
  bookingsSectionForce,
  clientDetailSectionForce,
  clientsSectionForce,
  parseOpenSections,
  readCookie,
  sectionStartsOpen,
  serializeOpenSections,
} from "./sections";

test("admin sections start collapsed and remember an explicit open set", () => {
  assert.equal(parseOpenSections(null).size, 0);
  assert.equal(parseOpenSections("").size, 0);
  assert.equal(parseOpenSections("Bad Id,clients:all,../x").has("clients:all"), true);
  assert.equal(parseOpenSections("Bad Id,clients:all,../x").size, 1);
  assert.equal(serializeOpenSections(["clients:all", "bad id", "clients:nas-sync"]), "clients:all,clients:nas-sync");
  assert.equal(sectionStartsOpen(parseOpenSections(null), "clients:all", false), false);
  assert.equal(sectionStartsOpen(parseOpenSections("clients:all"), "clients:all", false), true);
  assert.equal(sectionStartsOpen(parseOpenSections(null), "clients:all", true), true);

  const opened = adminSectionsCookie(serializeOpenSections(["clients:nas-sync"]), true);
  assert.match(opened, new RegExp(`^${ADMIN_SECTIONS_COOKIE}=`));
  assert.match(opened, /Secure/);
  assert.equal(parseOpenSections(readCookie(opened, ADMIN_SECTIONS_COOKIE))?.has("clients:nas-sync"), true);
  assert.match(adminSectionsCookie(""), /Max-Age=0/);
});

test("a search, custom sort, or create/sync result opens that admin module", () => {
  const quiet = { query: "", sortIsDefault: true, minted: false, synced: false, error: false };
  assert.equal(clientsSectionForce("clients:all", quiet), false);
  assert.equal(clientsSectionForce("clients:all", { ...quiet, query: "lepore" }), true);
  assert.equal(clientsSectionForce("clients:all", { ...quiet, sortIsDefault: false }), true);
  assert.equal(clientsSectionForce("clients:create-client", { ...quiet, minted: true }), true);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, minted: true }), false);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, synced: true }), true);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, error: true }), true);
  assert.equal(clientsSectionForce("clients:create-client", { ...quiet, error: true }), true);
  assert.equal(clientsSectionForce("clients:create-client", { ...quiet, error: true, synced: true }), false);
  assert.equal(bookingsSectionForce("bookings:upcoming", { notice: true }), true);
  assert.equal(bookingsSectionForce("bookings:past", { notice: true }), false);
  assert.equal(
    clientDetailSectionForce("client:info", {
      saved: true,
      userRemoved: false,
      bookingCancelled: false,
      error: "",
    }),
    true,
  );
  assert.equal(
    clientDetailSectionForce("client:delete", {
      saved: false,
      userRemoved: false,
      bookingCancelled: false,
      error: "Type DELETE to confirm.",
    }),
    true,
  );
  assert.equal(
    clientDetailSectionForce("client:logins", {
      saved: false,
      userRemoved: false,
      bookingCancelled: false,
      error: "User was not found on this client.",
    }),
    true,
  );
});

test("collapsed admin section is a button with a chevron and no visible page title", () => {
  const html = renderToStaticMarkup(
    createElement(AdminSection, {
      id: "clients:nas-sync",
      label: "NAS sync",
      defaultOpen: false,
      children: "Sync from NAS",
    }),
  );
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="[^"]+"/);
  assert.match(html, /NAS sync/);
  assert.match(html, /grid-rows-\[0fr\]/);
  assert.match(html, /Sync from NAS/);
  assert.doesNotMatch(html, />Admin</);

  const open = renderToStaticMarkup(
    createElement(AdminSection, {
      id: "clients:all",
      label: "All clients",
      defaultOpen: true,
      children: "list",
    }),
  );
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /grid-rows-\[1fr\]/);
  assert.match(open, /rotate-90/);
});

test("admin create-client copy does not say mint", () => {
  const created = renderToStaticMarkup(createElement(MintClientForm, { minted: "BK00002" }));
  assert.match(created, /Create next BK code/);
  assert.match(created, /Created BK00002/);
  assert.doesNotMatch(created, /mint/i);

  const edit = renderToStaticMarkup(
    createElement(EditClientForm, {
      client: {
        id: "c1",
        inviteCode: "BK00002",
        displayName: "Sam",
        primaryEmail: "sam@example.com",
        company: null,
        notes: null,
      },
    }),
  );
  assert.match(edit, /will create a new BK code/);
  assert.doesNotMatch(edit, /mint/i);

  const remove = renderToStaticMarkup(
    createElement(DeleteClientForm, { clientId: "c1", inviteCode: "BK00002" }),
  );
  assert.match(remove, /will create a new BK code/);
  assert.doesNotMatch(remove, /mint/i);

  const tools = readFileSync("src/lib/agent/tools.ts", "utf8");
  assert.match(tools, /"create_client"/);
  assert.match(tools, /Create the next BK invite code/);
  assert.match(tools, /can create a new code for that name/);
  assert.doesNotMatch(tools, /Mint the next|can mint a new code/);
});

test("signed-in pages drop the big page-name heading and keep a document title", () => {
  const clients = readFileSync("src/app/admin/clients/page.tsx", "utf8");
  assert.match(clients, /title: "Admin"/);
  assert.match(clients, /sr-only">Admin</);
  assert.match(clients, /Create client/);
  assert.doesNotMatch(clients, /pageTitleClass|Mint client/);

  const bookings = readFileSync("src/app/admin/bookings/page.tsx", "utf8");
  assert.match(bookings, /title: "Bookings"/);
  assert.match(bookings, /sr-only">Bookings</);
  assert.doesNotMatch(bookings, /pageTitleClass/);

  const scheduling = readFileSync("src/app/scheduling/page.tsx", "utf8");
  assert.match(scheduling, /title: "Scheduling"/);
  assert.match(scheduling, /sr-only">Scheduling</);
  assert.doesNotMatch(scheduling, /pageTitleClass/);

  const account = readFileSync("src/app/account/page.tsx", "utf8");
  assert.match(account, /title: "Account"/);
  assert.match(account, /sr-only">Account</);
  assert.doesNotMatch(account, /pageTitleClass/);

  const hub = readFileSync("src/app/hub/page.tsx", "utf8");
  assert.match(hub, /displayName/);
  assert.doesNotMatch(hub, />Home</);

  const detail = readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8");
  assert.match(detail, /client\.displayName/);
  assert.match(detail, /label="Client info"/);
});
