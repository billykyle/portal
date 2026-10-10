import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClientAgentContext } from "./access";
import { runClientTool, type ClientAgentOps } from "./handlers";

const clientA: ClientAgentContext = {
  tokenId: "token-a",
  userId: "user-a",
  email: "a@example.com",
  clientId: "client-a",
  inviteCode: "BK00001",
  resource: "https://portal.billy-kyle.com/api/client/mcp",
};

function stubOps(overrides: Partial<ClientAgentOps> = {}): ClientAgentOps {
  const fail = async () => {
    throw new Error("unexpected op");
  };
  return {
    listShoots: async () => [],
    getShoot: async () => null,
    listBookings: async () => [],
    getBooking: async () => null,
    listServices: async () => ({ category: "real_estate", services: ["Real Estate · Photography"] }),
    availableSlots: fail,
    createBooking: fail,
    modifyBooking: fail,
    cancelBooking: fail,
    audit: async () => undefined,
    ...overrides,
  };
}

test("a token for client A cannot read or change client B", async () => {
  const seen: string[] = [];
  const ops = stubOps({
    async getShoot(clientId, shootId) {
      seen.push(`shoot ${clientId} ${shootId}`);
      return null;
    },
    async getBooking(clientId, bookingId) {
      seen.push(`booking ${clientId} ${bookingId}`);
      return null;
    },
    async modifyBooking(input) {
      seen.push(`modify ${input.clientId} ${input.bookingId}`);
      return { ok: false, error: "That booking cannot be modified." };
    },
    async cancelBooking(input) {
      seen.push(`cancel ${input.clientId} ${input.bookingId}`);
      return { ok: false, error: "That booking cannot be cancelled." };
    },
    async createBooking(input) {
      seen.push(`create ${input.clientId}`);
      assert.equal(input.clientId, "client-a");
      return { ok: false, error: "That time is no longer available. Pick another." };
    },
  });

  const shoot = await runClientTool("get_my_shoot", { shootId: "shoot-b", clientId: "client-b" }, clientA, ops);
  const booking = await runClientTool("get_my_booking", { bookingId: "booking-b", clientId: "client-b" }, clientA, ops);
  const modified = await runClientTool(
    "modify_booking",
    { bookingId: "booking-b", clientId: "client-b", notes: "9999" },
    clientA,
    ops,
  );
  const cancelled = await runClientTool("cancel_booking", { bookingId: "booking-b", clientId: "client-b" }, clientA, ops);
  const created = await runClientTool(
    "create_booking",
    { address: "1 Main", services: ["Real Estate · Photography"], startsAt: "2026-10-12T14:00:00.000Z", clientId: "client-b" },
    clientA,
    ops,
  );

  assert.equal(shoot.ok, false);
  assert.equal(booking.ok, false);
  assert.equal(modified.ok, false);
  assert.equal(cancelled.ok, false);
  assert.equal(created.ok, false);
  assert.deepEqual(seen, [
    "shoot client-a shoot-b",
    "booking client-a booking-b",
    "modify client-a booking-b",
    "cancel client-a booking-b",
    "create client-a",
  ]);
  assert.equal(JSON.stringify(shoot).includes("client-b"), false);
  assert.match(modified.summary, /Rejected/);
  assert.doesNotMatch(modified.summary, /9999/);
});

test("list and get stay on the bound client and include the share link", async () => {
  let listed = "";
  const result = await runClientTool(
    "list_my_shoots",
    {},
    clientA,
    stubOps({
      async listShoots(clientId) {
        listed = clientId;
        return [
          {
            id: "s1",
            shotDate: "2026-09-01",
            dateLabel: "Sep 1, 2026",
            address: "10 Oak St",
            counts: { photo: 1, floor_plan: 0, video: 0, raw_video: 0, total: 1 },
            ready: true,
            shareUrl: "https://portal.billy-kyle.com/s/tok",
          },
        ];
      },
    }),
  );
  assert.equal(listed, "client-a");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const shoots = (result.data as { shoots: { shareUrl: string }[] }).shoots;
  assert.equal(shoots[0].shareUrl, "https://portal.billy-kyle.com/s/tok");
  assert.equal(result.summary, "Listed 1 shoot");
});
