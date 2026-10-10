import assert from "node:assert/strict";
import { test } from "node:test";
import { handleClientMcp, type ClientMcpDeps } from "./http";
import type { ClientAgentOps } from "./handlers";
import { resetClientAgentRateForTests, consumeClientAgentRate } from "./rate-limit";

function stubOps(): ClientAgentOps & { audits: { clientId: string; tool: string }[] } {
  const audits: { clientId: string; tool: string }[] = [];
  return {
    audits,
    listShoots: async (clientId) => {
      assert.equal(clientId, "client-a");
      return [
        {
          id: "s1",
          shotDate: "2026-09-01",
          dateLabel: "Sep 1",
          address: "10 Oak St",
          counts: { photo: 1, floor_plan: 0, video: 0, raw_video: 0, total: 1 },
          ready: true,
          shareUrl: "https://portal.billy-kyle.com/s/tok",
        },
      ];
    },
    getShoot: async () => null,
    listBookings: async () => [],
    getBooking: async () => null,
    listServices: async () => ({ category: "real_estate", services: ["Real Estate · Photography"] }),
    availableSlots: async () => ({ ok: false, error: "no" }),
    createBooking: async () => ({ ok: false, error: "no" }),
    modifyBooking: async () => ({ ok: false, error: "no" }),
    cancelBooking: async () => ({ ok: false, error: "no" }),
    audit: async (input) => {
      audits.push({ clientId: input.clientId, tool: input.tool });
    },
  };
}

function deps(ops: ClientAgentOps): ClientMcpDeps {
  return {
    ops,
    async resolve(authorization) {
      if (authorization === "Bearer token-a") {
        return {
          ok: true,
          context: {
            tokenId: "token-a",
            userId: "user-a",
            email: "a@example.com",
            clientId: "client-a",
            inviteCode: "BK00001",
            resource: "https://portal.billy-kyle.com/api/client/mcp",
          },
        };
      }
      return { ok: false, status: 401, error: authorization ? "invalid_token" : "invalid_request" };
    },
  };
}

function mcpRequest(body: unknown, authorization?: string) {
  return new Request("https://portal.billy-kyle.com/api/client/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("client mcp advertises OAuth metadata when the bearer is missing", async () => {
  const response = await handleClientMcp(
    mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    deps(stubOps()),
  );
  assert.equal(response.status, 401);
  const header = response.headers.get("www-authenticate") ?? "";
  assert.match(header, /resource_metadata="https:\/\/portal\.billy-kyle\.com\/\.well-known\/oauth-protected-resource\/api\/client\/mcp"/);
  const body = await response.json();
  assert.equal(body.error, "invalid_request");
});

test("client mcp lists only client tools and audits the bound client", async () => {
  const ops = stubOps();
  const init = await handleClientMcp(
    mcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0" } },
      },
      "Bearer token-a",
    ),
    deps(ops),
  );
  assert.equal(init.status, 200);
  const initBody = await init.json();
  assert.equal(initBody.result.serverInfo.name, "billy-kyle-client");

  const listed = await handleClientMcp(
    mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "Bearer token-a"),
    deps(ops),
  );
  const names = ((await listed.json()).result.tools as { name: string; description?: string }[]).map((tool) => tool.name);
  assert.deepEqual(names.sort(), [
    "cancel_booking",
    "create_booking",
    "get_available_slots",
    "get_my_booking",
    "get_my_shoot",
    "list_my_bookings",
    "list_my_shoots",
    "list_services",
    "modify_booking",
  ]);
  const listedBody = await handleClientMcp(
    mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" }, "Bearer token-a"),
    deps(ops),
  );
  const tools = (await listedBody.json()).result.tools as { name: string; description?: string }[];
  const create = tools.find((tool) => tool.name === "create_booking");
  assert.match(create?.description ?? "", /offered slot/);
  assert.match(create?.description ?? "", /booked through an agent/);
  assert.doesNotMatch(create?.description ?? "", /price|overlap override|admin/i);
  assert.equal(tools.some((tool) => tool.name === "list_clients"), false);

  const called = await handleClientMcp(
    mcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_my_shoots", arguments: {} } },
      "Bearer token-a",
    ),
    deps(ops),
  );
  assert.equal(called.status, 200);
  const text = (await called.json()).result.content[0].text as string;
  assert.match(text, /portal\.billy-kyle\.com\/s\/tok/);
  assert.deepEqual(ops.audits, [{ clientId: "client-a", tool: "list_my_shoots" }]);
});

test("rate limit is counted per token id", () => {
  resetClientAgentRateForTests();
  const now = Date.now();
  assert.equal(consumeClientAgentRate("token-a", now, 1).ok, true);
  assert.equal(consumeClientAgentRate("token-a", now, 1).ok, false);
  assert.equal(consumeClientAgentRate("token-b", now, 1).ok, true);
  resetClientAgentRateForTests();
});
