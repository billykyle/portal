import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AGENT_API_KEY_ENV, agentTokenMatches, authorizeAgentHeader, bearerToken } from "./auth";
import { consumeAgentRate, resetAgentRateForTests } from "./rate-limit";

const previous = process.env[AGENT_API_KEY_ENV];

afterEach(() => {
  if (previous == null) delete process.env[AGENT_API_KEY_ENV];
  else process.env[AGENT_API_KEY_ENV] = previous;
  resetAgentRateForTests();
});

test("bearerToken reads a bearer credential and ignores other schemes", () => {
  assert.equal(bearerToken("Bearer portal-key"), "portal-key");
  assert.equal(bearerToken("bearer portal-key"), "portal-key");
  assert.equal(bearerToken("Basic portal-key"), null);
  assert.equal(bearerToken(null), null);
});

test("agent auth rejects a missing key, a missing header, and a wrong key", () => {
  delete process.env[AGENT_API_KEY_ENV];
  assert.deepEqual(authorizeAgentHeader("Bearer anything"), {
    ok: false,
    status: 401,
    error: "Agent API is not configured.",
  });

  process.env[AGENT_API_KEY_ENV] = "correct-key";
  assert.equal(authorizeAgentHeader(null).ok, false);
  assert.equal(authorizeAgentHeader("Bearer wrong-key").ok, false);
  const wrong = authorizeAgentHeader("Bearer wrong-key");
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.error, "Unauthorized.");
  assert.equal(authorizeAgentHeader("Bearer correct-key").ok, true);
});

test("agentTokenMatches rejects a different length without throwing", () => {
  assert.equal(agentTokenMatches("short", "much-longer-secret"), false);
  assert.equal(agentTokenMatches("same-length-key", "same-length-key"), true);
  assert.equal(agentTokenMatches("same-length-key", "same-length-zzz"), false);
});

test("consumeAgentRate allows a small burst then rejects", () => {
  const key = "agent-rate-unit";
  assert.equal(consumeAgentRate(key, 1_000, 2, 60_000).ok, true);
  assert.equal(consumeAgentRate(key, 1_001, 2, 60_000).ok, true);
  const blocked = consumeAgentRate(key, 1_002, 2, 60_000);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.retryAfterSec >= 1);
});
