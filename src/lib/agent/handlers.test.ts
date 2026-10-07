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
    getNasSyncStatus: fail,
    listBookings: fail,
    getBooking: fail,
    modifyBooking: fail,
    queueBooking: fail,
    cancelBooking: fail,
    createBooking: fail,
    createQueuedBooking: fail,
    listShoots: fail,
    getShoot: fail,
    getShootShareLink: fail,
    getMaintenanceNotice: fail,
    setMaintenanceNotice: fail,
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
            category: "real_estate",
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
  assert.equal(seen, "code-asc");

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

test("list_clients filters by category and rejects an unknown category", async () => {
  let seen: string | undefined;
  const filtered = await runAgentTool(
    "list_clients",
    { category: "podcast" },
    stubOps({
      async listClients(input) {
        seen = input.category;
        return [];
      },
    }),
  );
  assert.equal(filtered.ok, true);
  assert.equal(seen, "podcast");

  let calls = 0;
  const invalid = await runAgentTool(
    "list_clients",
    { category: "studio" },
    stubOps({
      async listClients() {
        calls += 1;
        return [];
      },
    }),
  );
  assert.equal(invalid.ok, false);
  assert.equal(calls, 0);
  if (!invalid.ok) assert.match(invalid.error, /Category was not found/);
});

test("update_client leaves category untouched when the argument is omitted", async () => {
  let seen: string | null | undefined = "unset";
  const result = await runAgentTool(
    "update_client",
    { clientId: "c1", displayName: "Sam" },
    stubOps({
      async updateClient(input) {
        seen = input.category;
        return {
          ok: true,
          client: {
            id: "c1",
            inviteCode: "BK00004",
            displayName: "Sam",
            company: null,
            primaryEmail: "sam@example.com",
            notesSummary: "",
            notes: null,
            category: "podcast",
            userCount: 1,
            shootCount: 1,
            createdAt: "2026-09-04T00:00:00.000Z",
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(seen, undefined);
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
  if (removed.ok) assert.deepEqual(removed.revalidate, ["/admin/clients", "/home", "/admin/home"]);
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
          overlapWarning: "Overlaps an existing booking.",
          warnings: ["Overlaps an existing booking."],
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
  assert.equal(
    (result.data as { overlapWarning: string | null }).overlapWarning,
    "Overlaps an existing booking.",
  );
  assert.deepEqual((result.data as { warnings: string[] }).warnings, ["Overlaps an existing booking."]);
});

test("queue_booking requires an id and revalidates the client queue", async () => {
  const missing = await runAgentTool("queue_booking", {}, stubOps());
  assert.equal(missing.ok, false);
  const result = await runAgentTool(
    "queue_booking",
    { bookingId: "booking-1" },
    stubOps({
      async queueBooking(input) {
        assert.equal(input.bookingId, "booking-1");
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
            startsAt: null,
            endsAt: null,
            status: "queued",
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
  assert.equal((result.data as { booking: { status: string } }).booking.status, "queued");
  assert.ok(result.revalidate.includes("/admin/clients/c1"));
  assert.ok(result.revalidate.includes("/scheduling"));
});

test("create_queued_booking forwards the shoot with no time and revalidates the queue", async () => {
  const missing = await runAgentTool("create_queued_booking", {}, stubOps());
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error, "Choose a client.");
  const result = await runAgentTool(
    "create_queued_booking",
    {
      client: "BK00004",
      address: "12 Wood View Drive",
      services: ["Commercial video"],
      commercialHours: 3,
      notes: "Lockbox",
    },
    stubOps({
      async createQueuedBooking(input) {
        assert.equal(input.client, "BK00004");
        assert.equal(input.commercialHours, 3);
        assert.deepEqual(input.services, ["Commercial video"]);
        assert.equal(input.notes, "Lockbox");
        return {
          ok: true,
          booking: {
            bookingId: "booking-queued",
            client: { id: "c1", inviteCode: "BK00004", displayName: "Sam Lepore" },
            status: "queued",
            startsAt: null,
            endsAt: null,
            address: "12 Wood View Drive",
            services: ["Commercial video"],
            commercialVideoHours: 3,
            notes: "Lockbox",
            calendar: "skipped",
            email: "sent",
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const booking = (result.data as { booking: { status: string; startsAt: null; bookingId: string } }).booking;
  assert.equal(booking.status, "queued");
  assert.equal(booking.startsAt, null);
  assert.equal(booking.bookingId, "booking-queued");
  assert.ok(result.revalidate.includes("/scheduling"));
  assert.ok(result.revalidate.includes("/admin/home/queue"));
  assert.ok(result.revalidate.includes("/admin/clients/c1"));
});

test("create_booking forwards the shoot and revalidates booking pages", async () => {
  const result = await runAgentTool(
    "create_booking",
    {
      client: "BK00004",
      address: "12 Wood View Drive",
      services: ["Real Estate · Photography"],
      date: "2026-09-22",
      time: "7:40",
      notes: "Lockbox",
    },
    stubOps({
      async createBooking(input) {
        assert.equal(input.client, "BK00004");
        assert.equal(input.time, "7:40");
        assert.deepEqual(input.services, ["Real Estate · Photography"]);
        return {
          ok: true,
          booking: {
            ok: true,
            bookingId: "booking-new",
            client: { id: "c1", inviteCode: "BK00004", displayName: "Sam Lepore" },
            startsAt: "2026-09-22T23:40:00.000Z",
            startEt: "Tue, Sep 22 at 7:40 PM",
            timeZone: "America/New_York",
            calendar: "written",
            email: "sent",
            overlapWarning: null,
            warnings: [],
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.revalidate.includes("/admin/bookings"));
  assert.equal((result.data as { booking: { bookingId: string } }).booking.bookingId, "booking-new");
});

test("sync_from_nas returns the same readable error the admin button shows", async () => {
  const message = "Couldn't reach the NAS. Check that it's on and reachable.";
  const result = await runAgentTool(
    "sync_from_nas",
    {},
    stubOps({
      async syncFromNas() {
        return { ok: false, error: message };
      },
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, message);
});

test("sync_from_nas returns the job immediately, including one already running", async () => {
  const job = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "running" as const,
    source: "mcp" as const,
    phase: "walking",
    detail: "Marilyn O'Donoghue",
    clientsSeen: 2,
    shootsSeen: 4,
    startedAt: "2026-10-05T14:00:00.000Z",
    updatedAt: "2026-10-05T14:01:00.000Z",
    finishedAt: null,
    error: null,
    summary: null,
  };
  const started = await runAgentTool(
    "sync_from_nas",
    {},
    stubOps({
      async syncFromNas() {
        return { ok: true, start: { status: "started", job, recoveredStaleJobId: null } };
      },
    }),
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal((started.data as { status: string }).status, "started");
  assert.equal((started.data as { job: { id: string } }).job.id, job.id);
  assert.deepEqual(started.revalidate, []);

  const running = await runAgentTool(
    "sync_from_nas",
    {},
    stubOps({
      async syncFromNas() {
        return { ok: true, start: { status: "already_running", job, recoveredStaleJobId: null } };
      },
    }),
  );
  assert.equal(running.ok, true);
  if (!running.ok) return;
  assert.equal((running.data as { status: string }).status, "already_running");
});

test("get_nas_sync_status returns the job and a finished summary", async () => {
  const result = await runAgentTool(
    "get_nas_sync_status",
    { jobId: "11111111-1111-4111-8111-111111111111" },
    stubOps({
      async getNasSyncStatus(input) {
        assert.equal(input.jobId, "11111111-1111-4111-8111-111111111111");
        return {
          ok: true,
          recoveredStale: false,
          job: {
            id: input.jobId ?? "",
            status: "done",
            source: "mcp",
            phase: "done",
            detail: "Finished",
            clientsSeen: 1,
            shootsSeen: 1,
            startedAt: "2026-10-05T14:00:00.000Z",
            updatedAt: "2026-10-05T14:05:00.000Z",
            finishedAt: "2026-10-05T14:05:00.000Z",
            error: null,
            summary: {
              skipped: false,
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
          },
        };
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const data = result.data as { job: { summary: { ready: number }; finishedAt: string }; recoveredStale: boolean };
  assert.equal(data.job.summary.ready, 1);
  assert.equal(data.job.finishedAt, "2026-10-05T14:05:00.000Z");
  assert.equal(data.recoveredStale, false);
  assert.deepEqual(result.revalidate, []);
});

test("maintenance notice tools save or clear and never email", async () => {
  const missing = await runAgentTool("set_maintenance_notice", { message: "Portal updates" }, stubOps());
  assert.equal(missing.ok, false);

  let cleared = false;
  const clearedResult = await runAgentTool(
    "set_maintenance_notice",
    { clear: true, message: "ignored" },
    stubOps({
      async setMaintenanceNotice(input) {
        assert.deepEqual(input, { clear: true });
        cleared = true;
        return { ok: true, notice: null };
      },
    }),
  );
  assert.equal(cleared, true);
  assert.equal(clearedResult.ok, true);
  if (clearedResult.ok) assert.deepEqual(clearedResult.revalidate, ["/"]);

  const saved = await runAgentTool(
    "set_maintenance_notice",
    {
      message: "Portal updates",
      startsAt: "2026-09-28T13:00:00.000Z",
      endsAt: "2026-09-28T15:00:00.000Z",
    },
    stubOps({
      async setMaintenanceNotice(input) {
        assert.equal("clear" in input, false);
        if ("clear" in input) return { ok: true, notice: null };
        assert.equal(input.message, "Portal updates");
        return {
          ok: true,
          notice: {
            message: input.message,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
            live: false,
          },
        };
      },
    }),
  );
  assert.equal(saved.ok, true);

  const read = await runAgentTool(
    "get_maintenance_notice",
    {},
    stubOps({
      async getMaintenanceNotice() {
        return { notice: null };
      },
    }),
  );
  assert.equal(read.ok, true);
  if (read.ok) assert.deepEqual(read.data, { notice: null });

  const tools = readFileSync("src/lib/agent/tools.ts", "utf8");
  assert.match(tools, /get_maintenance_notice/);
  assert.match(tools, /set_maintenance_notice/);
  assert.doesNotMatch(tools, /Email all clients/);
});

test("agent tools do not reintroduce delivery tracking or attach-shoot", () => {
  const source = [
    readFileSync("src/lib/agent/tools.ts", "utf8"),
    readFileSync("src/lib/agent/handlers.ts", "utf8"),
    readFileSync("src/lib/agent/ops.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /Mark delivered|markShootDelivered|deliveredAt|attachShoot|Attach shoot/);
});
