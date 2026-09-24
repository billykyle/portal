import { timingSafeEqual } from "node:crypto";

export const AGENT_API_KEY_ENV = "PORTAL_AGENT_API_KEY";

export function agentApiKey() {
  const value = process.env[AGENT_API_KEY_ENV]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/** `Authorization: Bearer <token>`. Scheme match is case-insensitive. */
export function bearerToken(header: string | null) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}

export function agentTokenMatches(provided: string, expected: string) {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, Buffer.alloc(right.length));
    return false;
  }
  return timingSafeEqual(left, right);
}

export type AgentAuth =
  | { ok: true }
  | { ok: false; status: 401; error: string };

export function authorizeAgentHeader(authorization: string | null): AgentAuth {
  const expected = agentApiKey();
  if (!expected) {
    return { ok: false, status: 401, error: "Agent API is not configured." };
  }
  const provided = bearerToken(authorization);
  if (!provided || !agentTokenMatches(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }
  return { ok: true };
}

export function authorizeAgentRequest(request: Request): AgentAuth {
  return authorizeAgentHeader(request.headers.get("authorization"));
}
