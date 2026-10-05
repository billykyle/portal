import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSection } from "../../components/admin-section";
import { DeleteClientForm } from "../../components/forms/delete-client-form";
import { EditClientForm } from "../../components/forms/edit-client-form";
import { MintClientForm } from "../../components/forms/mint-client-form";
import { ADMIN_HOME_LINKS, adminHomeDestination } from "./home-links";
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
  sortByVisibleLabel,
} from "./sections";

test("admin home labels sort A–Z and each row is a link", () => {
  assert.deepEqual(
    sortByVisibleLabel([
      { label: "Queue" },
      { label: "All clients" },
      { label: "Upcoming" },
      { label: "Book a shoot" },
      { label: "Past" },
      { label: "NAS sync" },
      { label: "Create client" },
      { label: "Maintenance notice" },
    ]).map((section) => section.label),
    [
      "All clients",
      "Book a shoot",
      "Create client",
      "Maintenance notice",
      "NAS sync",
      "Past",
      "Queue",
      "Upcoming",
    ],
  );

  const home = readFileSync("src/app/admin/home/page.tsx", "utf8");
  assert.match(home, /ADMIN_HOME_LINKS/);
  assert.match(home, /<Link/);
  assert.doesNotMatch(home, /AdminSection|defaultOpen|aria-expanded|sectionStartsOpen/);

  const bookings = readFileSync("src/app/admin/bookings/page.tsx", "utf8");
  assert.match(bookings, /defaultOpen=\{false\}/);
  assert.match(bookings, /remember=\{false\}/);
  assert.doesNotMatch(bookings, /sectionStartsOpen|label="Queue" defaultOpen(?:\s|>)/);
  const detail = readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8");
  assert.match(detail, /defaultOpen=\{false\}/);
  assert.match(detail, /remember=\{false\}/);
  assert.doesNotMatch(detail, /sectionStartsOpen|backLabel|label="Queue" defaultOpen(?:\s|>)/);
  const header = readFileSync("src/components/admin-header.tsx", "utf8");
  assert.match(header, /NavMenu/);
  assert.doesNotMatch(header, /backLabel|backHref/);
});

test("a home query string opens the page that used to hold that result", () => {
  assert.equal(adminHomeDestination({}), null);
  assert.equal(adminHomeDestination({ q: "Radano" }), "/home/clients?q=Radano");
  assert.equal(adminHomeDestination({ minted: "BK00019" }), "/home/create-client?minted=BK00019");
  assert.equal(
    adminHomeDestination({ error: "Display name is required." }),
    "/home/create-client?error=Display+name+is+required.",
  );
  assert.match(adminHomeDestination({ synced: "1", clients: "2" }) ?? "", /^\/home\/nas-sync\?/);
  assert.match(adminHomeDestination({ syncError: "connect to device timeout" }) ?? "", /^\/home\/nas-sync\?/);
  assert.match(adminHomeDestination({ maintenance: "saved" }) ?? "", /^\/home\/maintenance\?/);
  assert.equal(adminHomeDestination({ cancelled: "1" }), "/home/upcoming?cancelled=1");
});

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

test("a search or create/sync result opens that admin module", () => {
  const quiet = {
    query: "",
    minted: false,
    synced: false,
    error: false,
    syncError: false,
  };
  assert.equal(clientsSectionForce("clients:all", quiet), false);
  assert.equal(clientsSectionForce("clients:all", { ...quiet, query: "lepore" }), true);
  assert.equal(sectionStartsOpen(parseOpenSections("clients:all,bookings:past"), "bookings:past", false), true);
  assert.equal(clientsSectionForce("clients:create-client", { ...quiet, minted: true }), true);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, minted: true }), false);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, synced: true }), true);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, error: true }), true);
  assert.equal(clientsSectionForce("clients:nas-sync", { ...quiet, syncError: true }), true);
  assert.equal(clientsSectionForce("clients:create-client", { ...quiet, syncError: true }), false);
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
        category: "real_estate",
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
  assert.doesNotMatch(clients, /pageTitleClass|Mint client|Create client/);

  const home = readFileSync("src/app/admin/home/page.tsx", "utf8");
  assert.match(home, /title: "Home"/);
  assert.match(home, /sr-only">Home</);
  assert.deepEqual(
    ADMIN_HOME_LINKS.map((item) => item.href),
    [
      "/home/clients",
      "/home/book",
      "/home/create-client",
      "/home/maintenance",
      "/home/nas-sync",
      "/home/past",
      "/home/queue",
      "/home/upcoming",
    ],
  );
  assert.deepEqual(
    ADMIN_HOME_LINKS.map((item) => item.label),
    [
      "All clients",
      "Book a shoot",
      "Create client",
      "Maintenance notice",
      "NAS sync",
      "Past",
      "Queue",
      "Upcoming",
    ],
  );
  assert.doesNotMatch(home, /pageTitleClass|Mint client|AdminSection|defaultOpen/);
  const directory = readFileSync("src/app/admin/home/clients/page.tsx", "utf8");
  assert.match(directory, /parseClientSort/);
  assert.match(directory, /CLIENT_SORT_COOKIE/);
  assert.match(directory, /sr-only">All clients</);
  assert.doesNotMatch(directory, /"name-asc"|showSort=\{false\}|pageTitleClass/);
  const clientsPage = readFileSync("src/app/admin/clients/page.tsx", "utf8");
  assert.match(clientsPage, /parseClientSort/);
  assert.doesNotMatch(clientsPage, /showSort=\{false\}/);

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

  const clientHome = readFileSync("src/app/home/page.tsx", "utf8");
  assert.match(clientHome, /displayName/);
  assert.doesNotMatch(clientHome, />Home</);

  const detail = readFileSync("src/app/admin/clients/[id]/page.tsx", "utf8");
  assert.match(detail, /client\.displayName/);
  assert.match(detail, /label="Client info"/);
});
