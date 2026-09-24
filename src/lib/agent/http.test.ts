import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
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
    listBookings: fail,
    getBooking: fail,
    modifyBooking: fail,
    cancelBooking: fail,
    listShoots: fail,
    getShoot: fail,
    getShootShareLink: fail,
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
    "list_bookings",
    "get_booking",
    "modify_booking",
    "cancel_booking",
    "list_client_shoots",
    "get_shoot",
    "get_shoot_share_link",
  ]) {
    assert.ok(names.includes(name), name);
  }
  const cancel = (listedBody.result.tools as { name: string; annotations?: { destructiveHint?: boolean } }[]).find(
    (tool) => tool.name === "cancel_booking",
  );
  assert.equal(cancel?.annotations?.destructiveHint, true);

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
