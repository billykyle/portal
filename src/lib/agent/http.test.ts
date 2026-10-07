import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createOverrideBooking, createQueuedBooking, type OverrideBookingDeps, type QueuedBookingDeps } from "@/lib/scheduling/admin-book";
import { AGENT_API_KEY_ENV } from "./auth";
import { handleAgentMcp } from "./http";
import type { AgentOps } from "./ops";
import { resetAgentRateForTests } from "./rate-limit";

const previous = process.env[AGENT_API_KEY_ENV];
const KEY = "test-agent-key";

function stubOps(): AgentOps {
  const fail = async () => {
    throw new Error("unexpected op");
  };
  return {
    listClients: async () => [
      {
        id: "c1",
        inviteCode: "BK00004",
        displayName: "Sam Lepore",
        company: "Lepore Realty",
        primaryEmail: "sam@example.com",
        notesSummary: "",
        category: "real_estate",
        userCount: 1,
        shootCount: 1,
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    ],
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
    getMaintenanceNotice: async () => ({ notice: null }),
    setMaintenanceNotice: fail,
  };
}

function mcpRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://admin.billy-kyle.com/api/agent/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": `agent-http-${method}-${Math.random()}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  if (previous == null) delete process.env[AGENT_API_KEY_ENV];
  else process.env[AGENT_API_KEY_ENV] = previous;
  resetAgentRateForTests();
});

test("mcp endpoint rejects a missing and a wrong API key", async () => {
  delete process.env[AGENT_API_KEY_ENV];
  const missing = await handleAgentMcp(mcpRequest("initialize", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), stubOps());
  assert.equal(missing.status, 401);
  const missingBody = await missing.json();
  assert.equal(missingBody.error, "Agent API is not configured.");

  process.env[AGENT_API_KEY_ENV] = KEY;
  const wrong = await handleAgentMcp(
    mcpRequest("initialize", { jsonrpc: "2.0", id: 1, method: "ping" }, { authorization: "Bearer nope" }),
    stubOps(),
  );
  assert.equal(wrong.status, 401);
  const wrongBody = await wrong.json();
  assert.equal(wrongBody.error, "Unauthorized.");
  assert.equal(JSON.stringify(wrongBody).includes("nope"), false);
  assert.equal(JSON.stringify(wrongBody).includes(KEY), false);
});

test("mcp endpoint lists tools and calls list_clients over stateless JSON", async () => {
  process.env[AGENT_API_KEY_ENV] = KEY;
  const ops = stubOps();
  const init = await handleAgentMcp(
    mcpRequest("initialize", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    }),
    ops,
  );
  assert.equal(init.status, 200);
  const initBody = await init.json();
  assert.equal(initBody.result.serverInfo.name, "atmos-portal");

  const listed = await handleAgentMcp(
    mcpRequest("tools/list", { jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ops,
  );
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  const names = (listedBody.result.tools as { name: string }[]).map((tool) => tool.name);
  for (const name of [
    "list_clients",
    "get_client",
    "create_client",
    "update_client",
    "delete_client",
    "list_client_users",
    "update_client_user",
    "remove_client_user",
    "sync_from_nas",
    "get_nas_sync_status",
    "list_bookings",
    "get_booking",
    "modify_booking",
    "queue_booking",
    "create_queued_booking",
    "create_booking",
    "cancel_booking",
    "list_client_shoots",
    "get_shoot",
    "get_shoot_share_link",
    "get_maintenance_notice",
    "set_maintenance_notice",
  ]) {
    assert.ok(names.includes(name), name);
  }
  const tools = listedBody.result.tools as {
    name: string;
    annotations?: { destructiveHint?: boolean };
    inputSchema?: { properties?: Record<string, { enum?: string[] }> };
  }[];
  const modify = tools.find((tool) => tool.name === "modify_booking") as { description?: string } | undefined;
  assert.match(modify?.description ?? "", /queued booking/);
  assert.match(modify?.description ?? "", /slot grid/);
  assert.match(modify?.description ?? "", /Shoot confirmed/);
  assert.match(modify?.description ?? "", /overlapWarning/);
  assert.match(modify?.description ?? "", /warnings/);
  assert.match(modify?.description ?? "", /already confirmed/);
  assert.doesNotMatch(modify?.description ?? "", /still has to be an offered slot/);
  assert.doesNotMatch(modify?.description ?? "", /rejected only when/);
  const cancel = tools.find((tool) => tool.name === "cancel_booking");
  assert.equal(cancel?.annotations?.destructiveHint, true);
  const listClientsTool = tools.find((tool) => tool.name === "list_clients");
  assert.deepEqual(listClientsTool?.inputSchema?.properties?.sort?.enum, [
    "code-desc",
    "code-asc",
    "name-asc",
    "name-desc",
    "company",
    "newest",
    "oldest",
    "shoots",
    "code",
  ]);

  const called = await handleAgentMcp(
    mcpRequest("tools/call", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_clients", arguments: {} },
    }),
    ops,
  );
  assert.equal(called.status, 200);
  const calledBody = await called.json();
  const text = calledBody.result.content[0].text as string;
  assert.match(text, /BK00004/);
  assert.equal(text.includes("passwordHash"), false);
});

test("tools/list includes create_booking and a token call creates the booking", async () => {
  process.env[AGENT_API_KEY_ENV] = KEY;
  const created: string[] = [];
  const ops = stubOps();
  ops.createBooking = async (input) => {
    const deps: OverrideBookingDeps = {
      async listClients() {
        return [
          {
            id: "11111111-1111-4111-8111-111111111111",
            inviteCode: "BK00004",
            displayName: "Sam Lepore",
            company: "Lepore Realty",
            primaryEmail: "sam@example.com",
            logins: [
              {
                email: "sam.login@example.com",
                firstName: "Sam",
                lastName: "Lepore",
                phone: null,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          },
        ];
      },
      async listConfirmedIntervals() {
        return [];
      },
      async insertBooking(row) {
        created.push(row.clientId);
        assert.equal(row.driveSecondsFromPrior, null);
        assert.equal(row.address, "12 Wood View Drive, Princeton NJ");
        return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
      },
      calendarOn: () => true,
      async settle(settled) {
        assert.equal(settled.skipOwnerNotify, true);
        assert.ok(settled.calendarWrite);
        assert.equal(settled.email.notes, "Lockbox 4");
        return {
          issues: { calendar: false, email: false, alertFailed: false },
          calendarEventId: "evt_mcp",
          billyNotified: false,
          alertSent: false,
        };
      },
    };
    const result = await createOverrideBooking(
      {
        source: "agent",
        client: input.client,
        address: input.address,
        services: input.services,
        date: input.date,
        time: input.time,
        notes: input.notes,
      },
      deps,
    );
    if (!result.ok) return result;
    return { ok: true, booking: result };
  };

  const listed = await handleAgentMcp(
    mcpRequest("tools/list", { jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ops,
  );
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  const tools = listedBody.result.tools as {
    name: string;
    description?: string;
    inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
  }[];
  const tool = tools.find((item) => item.name === "create_booking");
  assert.ok(tool);
  assert.match(tool.description ?? "", /America\/New_York/);
  assert.match(tool.description ?? "", /Real Estate · Photography/);
  assert.match(tool.description ?? "", /Real Estate · Exterior Only/);
  assert.match(tool.description ?? "", /Real Estate · Twilight/);
  assert.match(tool.description ?? "", /15-minute appointment/);
  assert.match(tool.description ?? "", /Philadelphia sunset/);
  assert.match(tool.description ?? "", /New shoot/);
  assert.match(tool.description ?? "", /overlapWarning/);
  assert.match(tool.description ?? "", /warnings/);
  assert.match(tool.description ?? "", /can be combined with other services/);
  assert.doesNotMatch(tool.description ?? "", /cannot be combined/);
  assert.doesNotMatch(tool.description ?? "", /second one is rejected/);
  for (const field of ["client", "address", "services", "date", "time", "notes"]) {
    assert.ok(tool.inputSchema?.properties?.[field], field);
  }
  for (const field of ["client", "address", "services", "date"]) {
    assert.ok(tool.inputSchema?.required?.includes(field), field);
  }
  assert.equal(tool.inputSchema?.required?.includes("time"), false);

  const called = await handleAgentMcp(
    mcpRequest("tools/call", {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_booking",
        arguments: {
          client: "BK00004",
          address: "12 Wood View Drive, Princeton NJ",
          services: ["Real Estate · Photography"],
          date: "2026-09-22",
          time: "7:40pm",
          notes: "Lockbox 4",
        },
      },
    }),
    ops,
  );
  assert.equal(called.status, 200);
  const calledBody = await called.json();
  const text = calledBody.result.content[0].text as string;
  assert.equal(calledBody.result.isError, false);
  assert.match(text, /aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.match(text, /Sam Lepore/);
  assert.match(text, /Tue, Sep 22 at 7:40 PM/);
  assert.equal(created.length, 1);
});

test("tools/list includes create_queued_booking and a call creates a shoot with no start time", async () => {
  process.env[AGENT_API_KEY_ENV] = KEY;
  const inserted: Array<{ startsAt: null; endsAt: null; status: "queued"; calendarEventId: null }> = [];
  const ops = stubOps();
  ops.createQueuedBooking = async (input) => {
    const deps: QueuedBookingDeps = {
      async listClients() {
        return [
          {
            id: "11111111-1111-4111-8111-111111111111",
            inviteCode: "BK00004",
            displayName: "Sam Lepore",
            company: "Lepore Realty",
            primaryEmail: "sam@example.com",
            logins: [
              {
                email: "sam.login@example.com",
                firstName: "Sam",
                lastName: "Lepore",
                phone: null,
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          },
        ];
      },
      async insertQueuedBooking(row) {
        inserted.push({
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          status: row.status,
          calendarEventId: row.calendarEventId,
        });
        assert.equal(row.clientId, "11111111-1111-4111-8111-111111111111");
        assert.equal(row.address, "12 Wood View Drive, Princeton NJ");
        assert.equal(row.commercialVideoHours, null);
        assert.deepEqual(row.services, ["Real Estate · Photography"]);
        return { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      },
      async sendHold(email) {
        assert.equal(email.clientEmail, "sam@example.com");
        assert.deepEqual(email.loginEmails, ["sam.login@example.com"]);
        assert.equal(email.notes, "Copy alex@agency.com");
        assert.equal(email.address, "12 Wood View Drive, Princeton NJ");
        return { clientSent: true };
      },
      async saveEmailIssue(_bookingId, emailFailed) {
        assert.equal(emailFailed, false);
      },
    };
    const result = await createQueuedBooking(
      {
        source: "agent",
        client: input.client,
        address: input.address,
        services: input.services,
        commercialHours: input.commercialHours,
        notes: input.notes,
      },
      deps,
    );
    if (!result.ok) return result;
    return {
      ok: true,
      booking: {
        bookingId: result.bookingId,
        client: result.client,
        status: result.status,
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        address: result.address,
        services: result.services,
        commercialVideoHours: result.commercialVideoHours,
        notes: result.notes,
        calendar: result.calendar,
        email: result.email,
      },
    };
  };

  const listed = await handleAgentMcp(
    mcpRequest("tools/list", { jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ops,
  );
  const listedBody = await listed.json();
  const tools = listedBody.result.tools as {
    name: string;
    description?: string;
    inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
  }[];
  const tool = tools.find((item) => item.name === "create_queued_booking");
  assert.ok(tool);
  assert.match(tool.description ?? "", /no start or end time/);
  assert.match(tool.description ?? "", /Your shoot is on hold/);
  assert.match(tool.description ?? "", /does not send Billy's New shoot email/i);
  assert.match(tool.description ?? "", /Google Calendar/);
  assert.match(tool.description ?? "", /Real Estate · Exterior Only/);
  for (const field of ["client", "address", "services", "notes", "commercialHours"]) {
    assert.ok(tool.inputSchema?.properties?.[field], field);
  }
  for (const field of ["client", "address", "services"]) {
    assert.ok(tool.inputSchema?.required?.includes(field), field);
  }
  assert.equal(tool.inputSchema?.properties?.date, undefined);
  assert.equal(tool.inputSchema?.properties?.time, undefined);

  const called = await handleAgentMcp(
    mcpRequest("tools/call", {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "create_queued_booking",
        arguments: {
          client: "BK00004",
          address: "12 Wood View Drive, Princeton NJ",
          services: ["Real Estate · Photography"],
          notes: "Copy alex@agency.com",
        },
      },
    }),
    ops,
  );
  assert.equal(called.status, 200);
  const calledBody = await called.json();
  const text = calledBody.result.content[0].text as string;
  assert.equal(calledBody.result.isError, false);
  assert.match(text, /bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/);
  assert.match(text, /"status": "queued"/);
  assert.match(text, /"startsAt": null/);
  assert.match(text, /"endsAt": null/);
  assert.match(text, /"calendar": "skipped"/);
  assert.match(text, /"email": "sent"/);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.startsAt, null);
  assert.equal(inserted[0]?.endsAt, null);
  assert.equal(inserted[0]?.status, "queued");
  assert.equal(inserted[0]?.calendarEventId, null);
});

test("authorized GET does not open an SSE stream", async () => {
  process.env[AGENT_API_KEY_ENV] = KEY;
  const response = await handleAgentMcp(
    new Request("https://admin.billy-kyle.com/api/agent/mcp", {
      method: "GET",
      headers: { authorization: `Bearer ${KEY}`, "x-forwarded-for": "agent-http-get" },
    }),
    stubOps(),
  );
  assert.equal(response.status, 405);
});
