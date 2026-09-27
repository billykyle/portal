import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavId, navItemsFor } from "./app-nav";

test("client menu lists hub destinations and highlights the current section", () => {
  assert.deepEqual(
    navItemsFor("client").map((item) => item.label),
    ["Home", "My Content", "Scheduling"],
  );
  assert.equal(activeNavId("client", "/hub"), "home");
  assert.equal(activeNavId("client", "/my-content"), "library");
  assert.equal(navItemsFor("client").find((item) => item.id === "library")?.href, "/my-content");
  assert.equal(activeNavId("client", "/shoots/shoot-1"), "library");
  assert.equal(activeNavId("client", "/scheduling/times"), "scheduling");
  assert.equal(activeNavId("client", "/scheduling/confirmed/abc"), "scheduling");
  assert.equal(activeNavId("client", "/account"), null);
});

test("admin menu lists home, then clients and bookings", () => {
  assert.deepEqual(
    navItemsFor("admin").map((item) => [item.label, item.href]),
    [
      ["Home", "/admin/home"],
      ["Clients", "/admin/clients"],
      ["Bookings", "/admin/bookings"],
    ],
  );
  assert.equal(activeNavId("admin", "/admin/home"), "home");
  assert.equal(activeNavId("admin", "/admin/clients"), "clients");
  assert.equal(activeNavId("admin", "/admin/clients/abc/users/user-1"), "clients");
  assert.equal(activeNavId("admin", "/shoots/shoot-1"), "clients");
  assert.equal(activeNavId("admin", "/admin/bookings"), "bookings");
  assert.equal(activeNavId("admin", "/admin/bookings/abc/times"), "bookings");
  assert.equal(activeNavId("admin", "/admin"), null);
});
