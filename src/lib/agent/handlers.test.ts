import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runAgentTool } from "./handlers";
import type { AgentOps } from "./ops";

function stubOps(overrides: Partial<AgentOps> = {}): AgentOps {
  const fail = async () => {
    throw new Error("unexpected op");
  };
  return {
    listClients: fail,
    getClient: fail,
    createClient: fail,
    updateClient: fail,
    deleteClient: fail,
    listUsers: fail,
    updateUser: fail,
    removeUser: fail,
    syncFromNas: fail,
    listBookings: fail,
    getBooking: fail,
    modifyBooking: fail,
    cancelBooking: fail,
    listShoots: fail,
    getShoot: fail,
    getShootShareLink: fail,
    ...overrides,
  };
}

test("list_clients returns the op payload and does not revalidate", async () => {
  const result = await runAgentTool(
    "list_clients",
    { query: "sam" },
    stubOps({
      async listClients(input) {
        assert.equal(input.query, "sam");
        assert.equal(input.sort, undefined);
        return [
          {
            id: "c1",
            inviteCode: "BK00004",
            displayName: "Sam Lepore",
            company: null,
            primaryEmail: "sam@example.com",
            notesSummary: "Repeat client",
            userCount: 1,
            shootCount: 2,
            createdAt: "2026-09-04T00:00:00.000Z",
          },
        ];
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.revalidate, []);
  assert.equal((result.data as { clients: { inviteCode: string }[] }).clients[0].inviteCode, "BK00004");
});

test("list_clients forwards sort and rejects an unknown sort before the op", async () => {
  let seen: string | undefined;
  const sorted = await runAgentTool(
    "list_clients",
    { sort: "code", query: "bk" },
    stubOps({
      async listClients(input) {
        seen = input.sort;
        assert.equal(input.query, "bk");
        return [];
      },
    }),
  );
  assert.equal(sorted.ok, true);
  assert.equal(seen, "code");

  let calls = 0;
  const invalid = await runAgentTool(
    "list_clients",
    { sort: "alpha" },
    stubOps({
      async listClients() {
        calls += 1;
        return [];
      },
    }),
  );
  assert.equal(invalid.ok, false);
  assert.equal(calls, 0);
  if (!invalid.ok) assert.match(invalid.error, /name-asc/);
});

test("delete_client requires an id and a confirmation code before calling the op", async () => {
  let calls = 0;
  const ops = stubOps({
    async deleteClient() {
      calls += 1;
      return { ok: true, client: { id: "c1", inviteCode: "BK00004" } };
    },
  });
  const missing = await runAgentTool("delete_client", { clientId: "c1" }, ops);
  assert.equal(missing.ok, false);
  assert.equal(calls, 0);
  const removed = await runAgentTool(
    "delete_client",
    { clientId: "c1", confirmInviteCode: "BK00004" },
    ops,
  );
  assert.equal(removed.ok, true);
  assert.equal(calls, 1);
  if (removed.ok) assert.deepEqual(removed.revalidate, ["/admin/clients"]);
});

test("cancel_booking and remove_client_user require explicit ids", async () => {
  const ops = stubOps();
  const cancel = await runAgentTool("cancel_booking", {}, ops);
  assert.equal(cancel.ok, false);
  const remove = await runAgentTool("remove_client_user", { clientId: "c1" }, ops);
  assert.equal(remove.ok, false);
});

test("list_bookings normalizes filters before the op", async () => {
  const result = await runAgentTool(
    "list_bookings",
    { when: "upcoming", limit: 5000, includeCancelled: true, inviteCode: "BK00004" },
    stubOps({
      async listBookings(input) {
        assert.equal(input.when, "upcoming");
        assert.equal(input.limit, 200);
        assert.equal(input.includeCancelled, true);
        assert.equal(input.inviteCode, "BK00004");
        return { ok: true, bookings: [] };
      },
    }),
  );
  assert.equal(result.ok, true);
});

test("modify_booking forwards partial fields and revalidates booking pages", async () => {
  const result = await runAgentTool(
    "modify_booking",
    { bookingId: "booking-1", notes: null, services: ["Real Estate · Photography"] },
    stubOps({
      async modifyBooking(input) {
        assert.equal(input.bookingId, "booking-1");
        assert.equal(input.notes, null);
        assert.deepEqual(input.services, ["Real Estate · Photography"]);
        assert.equal(input.address, undefined);
        return {
          ok: true,
          issues: { calendar: false, email: false },
          booking: {
            id: "booking-1",
            clientId: "c1",
            inviteCode: "BK00004",
            clientName: "Sam",
            address: "12 Wood View Drive",
            services: ["Real Estate · Photography"],
            startsAt: "2026-10-01T14:00:00.000Z",
            endsAt: "2026-10-01T14:45:00.000Z",
            status: "confirmed",
            notes: null,
            accessCodes: null,
            calendarEventId: null,
            syncIssue: null,
            canModify: true,
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.revalidate.includes("/admin/bookings/booking-1"));
});

test("sync_from_nas returns the summary from the shared admin sync", async () => {
  const result = await runAgentTool(
    "sync_from_nas",
    {},
    stubOps({
      async syncFromNas() {
        return {
          ok: true,
          sync: {
            clientsCreated: 1,
            clientsReused: 2,
            shootsCreated: 3,
            shootsReused: 4,
            mediaImported: 5,
            mediaUpdated: 0,
            mediaRemoved: 1,
            shootsRemoved: 0,
            ready: 1,
            warnings: [],
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.data as { sync: { ready: number } }).sync.ready, 1);
  assert.deepEqual(result.revalidate, ["/admin/clients"]);
});

test("agent tools do not reintroduce delivery tracking or attach-shoot", () => {
  const source = [
    readFileSync("src/lib/agent/tools.ts", "utf8"),
    readFileSync("src/lib/agent/handlers.ts", "utf8"),
    readFileSync("src/lib/agent/ops.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /Mark delivered|markShootDelivered|deliveredAt|attachShoot|Attach shoot/);
});
