type Bucket = { count: number; resetAt: number };

type GlobalRate = typeof globalThis & { __clientAgentRate?: Map<string, Bucket> };

function buckets() {
  const g = globalThis as GlobalRate;
  if (!g.__clientAgentRate) g.__clientAgentRate = new Map();
  return g.__clientAgentRate;
}

export const CLIENT_AGENT_RATE_LIMIT = 60;
export const CLIENT_AGENT_RATE_WINDOW_MS = 60_000;

export function resetClientAgentRateForTests() {
  buckets().clear();
}

/** Per access-token id, not per IP. */
export function consumeClientAgentRate(
  tokenId: string,
  now = Date.now(),
  limit = CLIENT_AGENT_RATE_LIMIT,
  windowMs = CLIENT_AGENT_RATE_WINDOW_MS,
) {
  const map = buckets();
  const current = map.get(tokenId);
  if (!current || current.resetAt <= now) {
    map.set(tokenId, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, retryAfterSec: 0 };
  }
  current.count += 1;
  if (current.count > limit) {
    return {
      ok: false as const,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  return { ok: true as const, retryAfterSec: 0 };
}
